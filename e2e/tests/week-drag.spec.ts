import { banner, expect, type Locator, onPlan, type Page, test } from "../support/test.ts";

onPlan();

const day = (page: Page, date: string) => page.locator(`#day-${date}`);

/** Long press (0.3 s in the app), then a slow drag to `target`'s center. */
async function pressAndDrag(page: Page, item: Locator, target?: Locator) {
  // Centered: a row already on screen can sit under the floating tab bar, where the press would land on the bar.
  await item.evaluate((el) => el.scrollIntoView({ block: "center" }));
  const from = await item.boundingBox();
  if (!from) throw new Error("Élément invisible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(450);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 + 20, { steps: 5 });
  if (target) {
    // The page scrolls under the held session, as her thumb would; dnd-kit measures again on the next frames.
    await target.evaluate((el) => el.scrollIntoView({ block: "center" }));
    // Aims again until that slot is the one under the finger: the days can still shift as the drag starts.
    const slot = target.locator("xpath=ancestor::div[1]");
    await expect(async () => {
      const to = await target.boundingBox();
      if (!to) throw new Error("Cible invisible");
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 });
      await expect(slot).toHaveClass(/border-action/, { timeout: 500 });
    }).toPass();
  }
}

test("Semaine : appui long puis glisser une course vers un autre jour la déplace", async ({ page }) => {
  await page.goto("/semaine");
  const run = day(page, "2026-11-18").getByRole("button", { name: /Côtes courtes/ });
  await expect(run).toHaveAttribute("aria-roledescription", "séance déplaçable");

  const friday = day(page, "2026-11-20");
  await pressAndDrag(page, run, friday.getByText("Déposer ici"));
  await page.mouse.up();

  const moved = banner(page, "Séance déplacée à");
  await expect(moved).toBeVisible();
  await expect(friday.getByRole("button", { name: /Côtes courtes/ })).toBeVisible();
  await expect(day(page, "2026-11-18").getByRole("button", { name: /Côtes courtes/ })).toHaveCount(0);

  await moved.getByRole("button", { name: "Annuler" }).click();
  await expect(day(page, "2026-11-18").getByRole("button", { name: /Côtes courtes/ })).toBeVisible();
});

test("Semaine : un cours de l'emploi du temps ne se glisse pas", async ({ page }) => {
  await page.goto("/semaine");
  const tuesday = day(page, "2026-11-17");
  const lesson = tuesday.getByRole("button", { name: /Anatomie/ });
  await expect(lesson).toBeVisible();
  await expect(lesson).not.toHaveAttribute("aria-roledescription", "séance déplaçable");

  await pressAndDrag(page, lesson);
  await expect(page.getByText("Déposer ici")).toHaveCount(0);
  await page.mouse.up();
  await expect(tuesday.getByRole("button", { name: /Anatomie/ })).toBeVisible();
});
