import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { E2E_NOW } from "./server.ts";

/**
 * Every page starts at the servers' time (`E2E_NOW` when they started, plus the time since), then runs on.
 * Its API calls carry `session`: WebKit keeps no `__Host-` cookie over http and drops a Cookie header set from
 * outside on Linux, so each call is replayed from here with it.
 */
export const test = base.extend<{ session: string }>({
  session: ["", { option: true }],
  page: async ({ page, session }, use) => {
    const elapsed = Date.now() - Number(process.env.E2E_STARTED);
    await page.clock.install({ time: Date.parse(E2E_NOW) + elapsed });
    await page.route("**/api/**", async (route) =>
      route.fulfill({ response: await route.fetch({ headers: { ...route.request().headers(), cookie: session } }) }),
    );
    await use(page);
  },
});

/** The server holding Anna's plan, already signed in. */
export const onPlan = () => test.use({ baseURL: process.env.E2E_PLAN_URL, session: process.env.E2E_PLAN_COOKIE ?? "" });
/** The server with nothing but her Garmin data, already signed in. */
export const onFresh = () =>
  test.use({ baseURL: process.env.E2E_FRESH_URL, session: process.env.E2E_FRESH_COOKIE ?? "" });

/** The bottom banner of a change, with its Annuler. */
export const banner = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });

export type { Locator, Page };
export { expect };
