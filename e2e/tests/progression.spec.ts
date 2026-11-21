import { expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Programme : Progression montre le semi estimé, attend une semaine pour la courbe, et ouvre son détail", async ({
  page,
}) => {
  await page.goto("/programme");
  const block = page.locator("section", { has: page.getByRole("heading", { name: "Progression", exact: true }) });
  const card = block.getByRole("article");
  await expect(card).toContainText("Semi estimé aujourd'hui");
  // Her programme began last week and her level was set on Monday: one week drawn is not a curve yet (algo.md PR1).
  await expect(card).toContainText("Ta courbe se dessine après ta première semaine.");
  await expect(card).toContainText("Temps de course par semaine");
  await expect(card).toContainText("cette semaine");

  await block.getByRole("button", { name: "Voir le détail de ta progression" }).click();
  const sheet = page.getByRole("dialog", { name: "Progression" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Ton semi estimé, semaine après semaine");
  await expect(sheet).toContainText("Semaine 2");
  await expect(sheet).toContainText("Départ");
  await expect(sheet).toContainText("La VO2max de ta montre : temps estimé");
  await sheet.getByRole("button", { name: "OK" }).click();
  await expect(sheet).toBeHidden();
});
