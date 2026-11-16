import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type FullConfig, webkit } from "@playwright/test";
import { loginLink, type Server, seed, startServer } from "./server.ts";

const auth = (file: string) => fileURLToPath(new URL(`../.auth/${file}`, import.meta.url));
export const STATE = { plan: auth("plan.json"), fresh: auth("fresh.json") };

/** Opens the one-time link like Anna, taps « Se connecter », and keeps the session cookie for the tests. */
async function logIn(browser: Browser, server: Server, file: string, use: FullConfig["projects"][number]["use"]) {
  const context = await browser.newContext({ ...use, baseURL: server.url });
  const page = await context.newPage();
  await page.goto(await loginLink(server));
  // The tap posts the form as is; its answer is read here for the session cookie (see below), then the page
  // gets an empty one: a route cannot hand WebKit a redirect.
  const answered = new Promise<{ status: number; setCookie?: string }>((resolve) => {
    void page.route("**/api/auth/login", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const response = await route.fetch({ maxRedirects: 0 });
      resolve({ status: response.status(), setCookie: response.headers()["set-cookie"] });
      await route.fulfill({ status: 200, contentType: "text/html", body: "" });
    });
  });
  await page.getByRole("button", { name: "Se connecter" }).click();
  const { status, setCookie } = await answered;
  await context.close();
  // The cookie is Secure (https in production): WebKit drops it over http://localhost, so the tests get it unsecured.
  const value = setCookie?.match(/^talaria_session=([^;]+)/)?.[1];
  if (status !== 302 || !value) throw new Error(`Connexion refusée (${status}) : pas de cookie de session.`);
  const cookie = { name: "talaria_session", value, domain: "localhost", path: "/", expires: -1 };
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ cookies: [{ ...cookie, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] }),
  );
}

/**
 * Two servers on temporary data: `plan` holds Anna's plan for the tests of each screen, `fresh` only her
 * Garmin data, for onboarding. Nothing is built here: `pnpm build` comes first.
 */
export default async function globalSetup(config: FullConfig) {
  const root = mkdtempSync(join(tmpdir(), "talaria-e2e-"));
  const planDir = join(root, "plan");
  const freshDir = join(root, "fresh");
  await Promise.all([seed(planDir, "plan"), seed(freshDir, "garmin")]);
  // The servers' clocks start at E2E_NOW now; the pages start where the servers are (see test.ts).
  process.env.E2E_STARTED = String(Date.now());
  const [plan, fresh] = await Promise.all([startServer(4310, planDir), startServer(4311, freshDir)]);
  const teardown = async () => {
    await Promise.all([plan.stop(), fresh.stop()]);
    rmSync(root, { recursive: true, force: true });
  };

  const use = config.projects[0]?.use ?? {};
  const browser = await (use.browserName === "chromium" ? chromium : webkit).launch();
  try {
    await logIn(browser, plan, STATE.plan, use);
    await logIn(browser, fresh, STATE.fresh, use);
  } catch (error) {
    await teardown();
    throw error;
  } finally {
    await browser.close();
  }
  process.env.E2E_PLAN_URL = plan.url;
  process.env.E2E_FRESH_URL = fresh.url;
  return teardown;
}
