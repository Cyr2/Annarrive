import { banner, expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

const toggle = (page: Page) => page.getByRole("button", { name: "Vue calendrier" });
const column = (page: Page, day: string) =>
  page.locator(".week-grid-col").and(page.getByRole("region", { name: day, exact: true }));

test("en portrait, le bouton Vue calendrier ouvre la grille et la referme", async ({ page }) => {
  await page.goto("/semaine");
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
  await expect(column(page, "Mardi 17")).toBeVisible();
  await expect(page.locator("#day-2026-11-19")).toHaveCount(0);

  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#day-2026-11-19")).toBeVisible();
});

test.describe("téléphone tourné", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("Semaine montre les sept jours en grille, et un appui long y déplace une course", async ({ page }) => {
    await page.goto("/semaine");
    await expect(toggle(page)).toHaveAttribute("aria-pressed", "true");
    for (const day of ["Lundi 16", "Jeudi 19", "Dimanche 22"]) await expect(column(page, day)).toBeVisible();

    const run = column(page, "Jeudi 19").getByRole("button", { name: /Footing/ });
    const from = await run.boundingBox();
    if (!from) throw new Error("Course invisible");
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 10, { steps: 5 });
    const slot = column(page, "Vendredi 20").locator(".week-grid-slot");
    await expect(slot).toBeVisible();
    await expect(async () => {
      const to = await slot.boundingBox();
      if (!to) throw new Error("Créneau invisible");
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 10 });
      await expect(slot).toHaveAttribute("data-over", "true", { timeout: 500 });
    }).toPass();
    await page.mouse.up();

    const moved = banner(page, /passée? à /);
    await expect(moved).toBeVisible();
    await expect(column(page, "Vendredi 20").getByRole("button", { name: /Footing/ })).toBeVisible();
    await moved.getByRole("button", { name: "Annuler" }).click();
    await expect(column(page, "Jeudi 19").getByRole("button", { name: /Footing/ })).toBeVisible();
  });
});
