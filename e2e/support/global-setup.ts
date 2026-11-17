import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Browser, chromium, type FullConfig, webkit } from "@playwright/test";
import { loginLink, newPassword, type Server, seed, startServer } from "./server.ts";

/** Opens the one-time link like Anna, taps « Se connecter », and returns the session cookie for the tests. */
async function logIn(browser: Browser, server: Server, use: FullConfig["projects"][number]["use"]): Promise<string> {
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
  // `__Host-` cookies must be Secure, which WebKit drops over http://localhost: the tests send it themselves (test.ts).
  const cookie = setCookie?.match(/^__Host-annarrive_session=[^;]+/)?.[0];
  if (status !== 302 || !cookie) throw new Error(`Connexion refusée (${status}) : pas de cookie de session.`);
  return cookie;
}

/**
 * Two servers on temporary data: `plan` holds Anna's plan for the tests of each screen, `fresh` only her
 * Garmin data, for onboarding. Nothing is built here: `pnpm build` comes first.
 */
export default async function globalSetup(config: FullConfig) {
  const root = mkdtempSync(join(tmpdir(), "annarrive-e2e-"));
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
    process.env.E2E_PLAN_COOKIE = await logIn(browser, plan, use);
    process.env.E2E_FRESH_COOKIE = await logIn(browser, fresh, use);
    // Anna's account on the plan server, for the login screen's tests.
    process.env.E2E_PASSWORD = await newPassword(plan, "anna");
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
