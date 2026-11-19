import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Programme : changer de course recalcule le plan sans toucher la semaine en cours, puis Annuler le remet", async ({
  page,
}) => {
  await page.goto("/semaine");
  const today = page.locator("#day-2026-11-17");
  await expect(today).toContainText("6 × 10 s");
  const week = page.locator([16, 17, 18, 19, 20, 21, 22].map((d) => `#day-2026-11-${d}`).join(", "));
  const thisWeek = await week.allInnerTexts();

  await page.getByRole("link", { name: "Programme" }).click();
  const card = page.getByRole("article", { name: "Ton objectif" });
  await expect(card.getByRole("heading")).toHaveText("Semi-marathon");
  await card.getByRole("button", { name: "Modifier l'objectif" }).click();
  const sheet = page.getByRole("dialog", { name: "Ton objectif" });
  await sheet.getByRole("button", { name: "10 km", exact: true }).click();
  await sheet.getByRole("button", { name: "Valider" }).click();

  const changed = banner(page, "Objectif modifié");
  await expect(changed).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(card.getByRole("heading")).toHaveText("10 km");

  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(today).toContainText("6 × 10 s");
  expect(await week.allInnerTexts()).toEqual(thisWeek);

  await changed.getByRole("button", { name: "Annuler" }).click();
  await expect(banner(page, "Changement annulé")).toBeVisible();
  await page.getByRole("link", { name: "Programme" }).click();
  await expect(card.getByRole("heading")).toHaveText("Semi-marathon");
});
