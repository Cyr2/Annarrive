import { defineConfig, devices } from "@playwright/test";

// One shared server and plan: the tests run one after the other and undo what they change.
export default defineConfig({
  testDir: "tests",
  globalSetup: "./support/global-setup.ts",
  // Tests are independent (each undoes its change): spreading them one by one evens out the CI shards.
  fullyParallel: true,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    trace: "retain-on-failure",
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    // The service worker would serve a cached shell between tests.
    serviceWorkers: "block",
  },
  projects: [
    // Anna uses Safari on her iPhone; E2E_BROWSER=chromium where WebKit is missing.
    {
      name: "iphone",
      use: { ...devices["iPhone 15"], ...(process.env.E2E_BROWSER === "chromium" ? { browserName: "chromium" } : {}) },
    },
  ],
});
