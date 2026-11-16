import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { STATE } from "./global-setup.ts";
import { E2E_NOW } from "./server.ts";

/** Every page starts at the servers' time (`E2E_NOW` when they started, plus the time since), then runs on. */
export const test = base.extend({
  page: async ({ page }, use) => {
    const elapsed = Date.now() - Number(process.env.E2E_STARTED);
    await page.clock.install({ time: Date.parse(E2E_NOW) + elapsed });
    await use(page);
  },
});

/** The server holding Anna's plan, already signed in. */
export const onPlan = () => test.use({ baseURL: process.env.E2E_PLAN_URL, storageState: STATE.plan });
/** The server with nothing but her Garmin data, already signed in. */
export const onFresh = () => test.use({ baseURL: process.env.E2E_FRESH_URL, storageState: STATE.fresh });

/** The bottom banner of a change, with its Annuler. */
export const banner = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text });

export type { Locator, Page };
export { expect };
