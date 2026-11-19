import { expect, onPlan, test } from "../support/test.ts";

onPlan();

test("l'animation de lancement se coupe d'un toucher, qui atteint le bouton dessous", async ({ page }) => {
  await page.goto("/");
  const splash = page.locator("#splash");
  await expect(splash).toBeAttached();
  // Held where it is: the tap must land while it plays, however slow the runner.
  await page.evaluate(() => {
    for (const element of document.querySelectorAll("#splash, #splash *"))
      for (const animation of element.getAnimations()) animation.pause();
  });
  await page.getByRole("button", { name: "Changer", exact: true }).click();
  await expect(splash).not.toBeAttached();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("l'animation de lancement finit seule et quitte la page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#splash")).toBeAttached();
  await expect(page.locator("#splash")).not.toBeAttached({ timeout: 5000 });
});

test.describe("réduire les animations", () => {
  test.use({ reducedMotion: "reduce" });
  test("aucune animation de lancement", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Changer", exact: true }).waitFor();
    await expect(page.locator("#splash")).toHaveCount(0);
  });
});
