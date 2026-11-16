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
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(`${server.url}/`);
  const state = await context.storageState();
  await context.close();
  // The server sets a Secure cookie (https in production); WebKit never sends one back over http://localhost.
  const cookies = state.cookies.map((cookie) => ({ ...cookie, secure: false }));
  if (!cookies.some((c) => c.name === "talaria_session"))
    throw new Error("Connexion refusée : pas de cookie de session.");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ ...state, cookies }));
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
