import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { E2E_NOW, MONDAY_NOW } from "./server.ts";

/**
 * Every page starts at its server's time (`now` when the servers started, plus the time since), then runs on.
 * Its API calls carry `session`: WebKit keeps no `__Host-` cookie over http and drops a Cookie header set from
 * outside on Linux, so each call is replayed from here with it.
 */
export const test = base.extend<{ session: string; now: string }>({
  session: ["", { option: true }],
  now: [E2E_NOW, { option: true }],
  page: async ({ page, session, now }, use) => {
    const elapsed = Date.now() - Number(process.env.E2E_STARTED);
    await page.clock.install({ time: Date.parse(now) + elapsed });
    await page.route("**/api/**", async (route) =>
      route.fulfill({
        // A local socket reset (ECONNRESET) is replayed rather than failing the test.
        response: await route.fetch({ headers: { ...route.request().headers(), cookie: session }, maxRetries: 3 }),
      }),
    );
    await use(page);
    // A call still in flight when the test ends (an idle preload) must not fail it.
    await page.unrouteAll({ behavior: "ignoreErrors" });
  },
});

/** The server holding Anna's plan, already signed in. */
export const onPlan = () => test.use({ baseURL: process.env.E2E_PLAN_URL, session: process.env.E2E_PLAN_COOKIE ?? "" });
/** The server with nothing but her Garmin data, already signed in. */
export const onFresh = () =>
  test.use({ baseURL: process.env.E2E_FRESH_URL, session: process.env.E2E_FRESH_COOKIE ?? "" });
/** The same, on the Monday evening she starts (`MONDAY_NOW`), with her runs of the week before. */
export const onMonday = () =>
  test.use({ baseURL: process.env.E2E_MONDAY_URL, session: process.env.E2E_MONDAY_COOKIE ?? "", now: MONDAY_NOW });

/** The bottom banner of a change, with its Annuler. */
export const banner = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });

export type { Locator, Page };
export { expect };
