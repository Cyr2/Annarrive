import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healthSchema } from "@talaria/protocol";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";
import { MONDAY_8AM, SECRET, setup } from "./helpers.ts";

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
    const webDist = await mkdtemp(join(tmpdir(), "talaria-web-"));
    await writeFile(join(webDist, "index.html"), "<!doctype html><title>Talaria</title>");
    const { services } = setup();
    const response = await createApp({ services, sessionSecret: SECRET, webDist }).request("/semaine");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Talaria");
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
    expect(cookie).toMatch(/^talaria_session=/);
    expect(cookie).toContain("Max-Age=15552000");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect((await t.call("GET", "/api/today")).status).toBe(200);
  });

  it("refuses a link used twice or older than 15 minutes", async () => {
    const t = setup();
    const link = new URL(t.services.auth.createLoginLink("https://talaria.test"));
    expect((await t.app.request(`${link.pathname}${link.search}`)).status).toBe(302);
    expect((await t.app.request(`${link.pathname}${link.search}`)).status).toBe(401);

    const late = new URL(t.services.auth.createLoginLink("https://talaria.test"));
    t.setNow(new Date(MONDAY_8AM.getTime() + 15 * 60_000));
    expect((await t.app.request(`${late.pathname}${late.search}`)).status).toBe(401);
  });

  it("ends the session after 180 days", async () => {
    const t = setup();
    await t.login();
    t.setNow(new Date(MONDAY_8AM.getTime() + 181 * 24 * 3600_000));
    expect((await t.call("GET", "/api/today")).status).toBe(401);
  });

  it("refuses a forged cookie", async () => {
    const t = setup();
    const response = await t.app.request("/api/today", { headers: { cookie: "talaria_session=forged.c2lnbmF0dXJl" } });
    expect(response.status).toBe(401);
  });

  it("blocks login for 15 minutes after 5 wrong links", async () => {
    const t = setup();
    for (let i = 0; i < 5; i++) expect((await t.app.request("/api/auth/login?token=wrong")).status).toBe(401);
    const blocked = await t.app.request("/api/auth/login?token=wrong");
    expect(blocked.status).toBe(429);
    expect((await t.login()).status).toBe(429);

    t.setNow(new Date(MONDAY_8AM.getTime() + 15 * 60_000));
    expect((await t.login()).status).toBe(302);
  });
});
