import { expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

const WEEK_FILE = /\/assets\/WeekScreen-.*\.js$/;

/** Page loads of the tab: the first visit, then each reload. */
function countLoads(page: Page) {
  const loads = { count: 0 };
  page.on("request", (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) loads.count += 1;
  });
  return loads;
}

test("un écran dont le fichier a disparu avec une version recharge l'app une fois, et l'écran revient", async ({
  page,
}) => {
  const loads = countLoads(page);
  // A version deployed since: the old shell's file is gone and the server's shell names other files, until the reload.
  await page.route(WEEK_FILE, (route) =>
    loads.count > 1 ? route.continue() : route.fulfill({ status: 404, contentType: "text/plain", body: "" }),
  );
  await page.route(/\/\?shell=\d+$/, (route) =>
    route.fulfill({ contentType: "text/html", body: '<script type="module" src="/assets/index-new.js"></script>' }),
  );
  await page.goto("/");
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.getByRole("link", { name: "Semaine" }).click();

  await expect(page.getByRole("button", { name: "Semaine suivante" })).toBeVisible();
  expect(loads.count).toBe(2);
});

test("hors ligne, l'écran manquant garde Réessayer sans recharger l'app", async ({ page, context }) => {
  const loads = countLoads(page);
  await page.route(WEEK_FILE, (route) => route.abort("internetdisconnected"));
  await page.goto("/");
  await expect(page.getByRole("article").first()).toBeVisible();
  await context.setOffline(true);
  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.getByRole("heading", { name: "Écran indisponible" })).toBeVisible();
  // The recovery would have reloaded by now.
  await page.waitForTimeout(1000);
  expect(loads.count).toBe(1);

  await context.setOffline(false);
  await page.unroute(WEEK_FILE);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("button", { name: "Semaine suivante" })).toBeVisible();
});
