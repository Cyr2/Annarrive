import { createHash } from "node:crypto";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healthSchema } from "@annarrive/protocol";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createApp, rateLimit } from "../src/app.ts";
import { MONDAY_8AM, postLogin, SECRET, setup } from "./helpers.ts";

describe("server", () => {
  it("answers the health check without a session", async () => {
    const response = await setup().app.request("/api/health");
    expect(response.status).toBe(200);
    expect(healthSchema.parse(await response.json()).status).toBe("ok");
  });

  it("returns a French 404 for an unknown API route", async () => {
    const t = setup();
    await t.login();
    expect(await t.call("GET", "/api/nope")).toEqual({ status: 404, json: { error: "Route inconnue" } });
  });

  it("asks for JSON when the body is not JSON", async () => {
    const t = setup();
    await t.login();
    const cookie = (await t.login()).headers.get("set-cookie")?.split(";")[0] ?? "";
    const response = await t.app.request("/api/profile", { method: "PATCH", headers: { cookie }, body: "pas du json" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "La requête doit contenir du JSON." });
  });

  it("hides unexpected errors behind a generic French message", async () => {
    const t = setup({ ics: async () => Promise.reject(new TypeError("détail interne")) });
    await t.login();
    expect(await t.call("POST", "/api/timetable/refresh")).toEqual({
      status: 500,
      json: { error: "Erreur du serveur : réessaie dans un instant." },
    });
  });

  it("serves the app shell for client-side routes", async () => {
    const webDist = await mkdtemp(join(tmpdir(), "annarrive-web-"));
    await writeFile(join(webDist, "index.html"), "<!doctype html><title>Annarrivé</title>");
    const { services } = setup();
    const response = await createApp({ services, sessionSecret: SECRET, webDist }).request("/semaine");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Annarrivé");
  });

  it("serves hashed assets compressed and cached for good", async () => {
    const webDist = await mkdtemp(join(tmpdir(), "annarrive-web-"));
    await mkdir(join(webDist, "assets"));
    await writeFile(join(webDist, "assets", "index-abc.js"), "console.log('Annarrivé');\n".repeat(100));
    const { services } = setup();
    const app = createApp({ services, sessionSecret: SECRET, webDist });
    const response = await app.request("/assets/index-abc.js", { headers: { "accept-encoding": "gzip" } });
    expect(response.headers.get("content-encoding")).toBe("gzip");
    expect(response.headers.get("cache-control")).toContain("immutable");
    expect((await app.request("/semaine")).headers.get("cache-control")).toBeNull();
  });

  it("draws the login page in the app's font, from the file the built app preloads", async () => {
    const webDist = await mkdtemp(join(tmpdir(), "annarrive-web-"));
    const href = "/assets/outfit-latin-wght-normal-Ab_1.woff2";
    await writeFile(join(webDist, "index.html"), `<link rel="preload" href="${href}" as="font">`);
    const { services } = setup();
    const page = await (
      await createApp({ services, sessionSecret: SECRET, webDist }).request("/api/auth/login")
    ).text();
    expect(page).toContain(`src:url(${href})`);
    expect(await (await setup().app.request("/api/auth/login")).text()).not.toContain("@font-face");
  });
});

describe("hardening", () => {
  it("sends the security headers on the API and on the app", async () => {
    const webDist = await mkdtemp(join(tmpdir(), "annarrive-web-"));
    await writeFile(join(webDist, "index.html"), "<!doctype html><title>Annarrivé</title>");
    const { services } = setup();
    const app = createApp({ services, sessionSecret: SECRET, webDist });
    for (const path of ["/api/health", "/semaine"]) {
      const headers = (await app.request(path)).headers;
      const csp = headers.get("content-security-policy") ?? "";
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self';");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("object-src 'none'");
      expect(headers.get("strict-transport-security")).toBe("max-age=63072000; includeSubDomains");
      expect(headers.get("referrer-policy")).toBe("no-referrer");
      expect(headers.get("x-frame-options")).toBe("DENY");
      expect(headers.get("x-content-type-options")).toBe("nosniff");
      expect(headers.get("permissions-policy")).toContain("camera=()");
    }
  });

  it("lets the built page's own inline scripts run, and only those", async () => {
    const webDist = await mkdtemp(join(tmpdir(), "annarrive-web-"));
    await writeFile(
      join(webDist, "index.html"),
      `<script type="module" src="/assets/index.js"></script><script id="sw">register()</script><script>preload()</script>`,
    );
    const { services } = setup();
    const csp = (await createApp({ services, sessionSecret: SECRET, webDist }).request("/semaine")).headers.get(
      "content-security-policy",
    );
    const hash = (body: string) => `'sha256-${createHash("sha256").update(body).digest("base64")}'`;
    expect(csp).toContain(`script-src 'self' ${hash("register()")} ${hash("preload()")};`);
  });

  it("refuses a state-changing call from another site, even with her cookie", async () => {
    const t = setup();
    await t.login();
    const cookie = (await t.login()).headers.get("set-cookie")?.split(";")[0] ?? "";
    const post = (headers: Record<string, string>) =>
      t.app.request("/api/feel-better", { method: "POST", headers: { cookie, ...headers } });

    expect((await post({ "sec-fetch-site": "cross-site" })).status).toBe(403);
    expect((await post({ "sec-fetch-site": "same-site" })).status).toBe(403);
    expect((await post({ origin: "https://evil.test", host: "annarrive.test" })).status).toBe(403);
    expect(
      (await post({ origin: "https://annarrive.test", host: "annarrive.test", "sec-fetch-site": "same-origin" }))
        .status,
    ).not.toBe(403);
    const read = await t.app.request("/api/today", { headers: { cookie, "sec-fetch-site": "cross-site" } });
    expect(read.status).toBe(200);
  });

  it("refuses a body over 64 kB", async () => {
    const t = setup();
    await t.login();
    expect((await t.call("POST", "/api/chat", { text: "x".repeat(70_000) })).status).toBe(413);
  });

  it("limits each route's window and opens again after it", async () => {
    let now = 0;
    const limit = rateLimit(2, 1000, () => now);
    const app = new Hono().onError((e, c) => c.json({ error: e.message }, 429)).get("/", limit, (c) => c.text("ok"));
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(200);
    expect((await app.request("/")).status).toBe(429);
    now = 1000;
    expect((await app.request("/")).status).toBe(200);
  });

  it("caps Reggie at 30 messages per 10 minutes", async () => {
    const t = setup({ reggie: async function* () {} });
    await t.login();
    for (let i = 0; i < 30; i++) await t.request("POST", "/api/chat", { text: "x" });
    expect((await t.call("POST", "/api/chat", { text: "x" })).status).toBe(429);
  });
});

describe("login", () => {
  it("refuses every API route without a session", async () => {
    const t = setup();
    expect(await t.call("GET", "/api/today")).toEqual({
      status: 401,
      json: { error: "Connexion requise : ouvre un nouveau lien de connexion." },
    });
  });

  it("turns a one-time link into a 180-day httpOnly, Secure, SameSite=Lax cookie", async () => {
    const t = setup();
    const response = await t.login();
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    const cookie = response.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^__Host-annarrive_session=/);
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=15552000");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect((await t.call("GET", "/api/today")).status).toBe(200);
  });

  it("opening the link only shows a Se connecter button, so a message preview does not use it up", async () => {
    const t = setup();
    const link = new URL(t.services.auth.createLoginLink("https://annarrive.test"));
    const token = link.searchParams.get("token") ?? "";

    const preview = await t.app.request(`${link.pathname}${link.search}`);
    await t.app.request(`${link.pathname}${link.search}`);

    expect(preview.status).toBe(200);
    expect(preview.headers.get("set-cookie")).toBeNull();
    const page = await preview.text();
    expect(page).toContain('<form method="post" action="/api/auth/login">');
    expect(page).toContain(`value="${token}"`);
    expect(page).toContain("Se connecter");
    expect((await postLogin(t.app, token)).status).toBe(302);
  });

  it("logs in once per link: a second POST is refused with a French page", async () => {
    const t = setup();
    const token = new URL(t.services.auth.createLoginLink("https://annarrive.test")).searchParams.get("token") ?? "";
    expect((await postLogin(t.app, token)).status).toBe(302);

    const second = await postLogin(t.app, token);

    expect(second.status).toBe(401);
    expect(second.headers.get("set-cookie")).toBeNull();
    expect(await second.text()).toContain("Ce lien de connexion n'est plus valable");
  });

  it("refuses a link older than 15 minutes", async () => {
    const t = setup();
    const late = new URL(t.services.auth.createLoginLink("https://annarrive.test")).searchParams.get("token") ?? "";
    t.setNow(new Date(MONDAY_8AM.getTime() + 15 * 60_000));
    expect((await postLogin(t.app, late)).status).toBe(401);
  });

  it("refuses a login form posted from another site without using up the link", async () => {
    const t = setup();
    const token = new URL(t.services.auth.createLoginLink("https://annarrive.test")).searchParams.get("token") ?? "";
    expect((await postLogin(t.app, token, "cross-site")).status).toBe(403);
    expect((await postLogin(t.app, token)).status).toBe(302);
  });

  it("refuses a link whose token is not base64url", async () => {
    const t = setup();
    expect((await t.app.request("/api/auth/login?token=%22%3E%3Cscript%3E")).status).toBe(400);
  });

  it("ends the session after 180 days", async () => {
    const t = setup();
    await t.login();
    t.setNow(new Date(MONDAY_8AM.getTime() + 181 * 24 * 3600_000));
    expect((await t.call("GET", "/api/today")).status).toBe(401);
  });

  it("refuses a forged cookie", async () => {
    const t = setup();
    const response = await t.app.request("/api/today", {
      headers: { cookie: "annarrive_session=forged.c2lnbmF0dXJl" },
    });
    expect(response.status).toBe(401);
  });

  it("blocks login for 15 minutes after 5 wrong links", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) expect((await postLogin(t.app, "wrong")).status).toBe(401);
    const blocked = await postLogin(t.app, "wrong");
    expect(blocked.status).toBe(429);
    expect((await t.login()).status).toBe(429);

    t.setNow(new Date(MONDAY_8AM.getTime() + 15 * 60_000));
    expect((await t.login()).status).toBe(302);
  });
});
