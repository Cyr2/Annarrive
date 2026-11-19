import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Programme : une course dimanche fait de la fin de semaine une semaine de course, puis Annuler la remet", async ({
  page,
}) => {
  await page.goto("/semaine");
  const sunday = page.locator("#day-2026-11-22");
  const week = page.locator([16, 17, 18, 19, 20, 21, 22].map((d) => `#day-2026-11-${d}`).join(", "));
  await expect(page.locator("#day-2026-11-17")).toContainText("6 × 10 s");
  const thisWeek = await week.allInnerTexts();

  await page.getByRole("link", { name: "Programme" }).click();
  const card = page.getByRole("article", { name: "Ton objectif" });
  await card.getByRole("button", { name: "Modifier l'objectif" }).click();
  const sheet = page.getByRole("dialog", { name: "Ton objectif" });
  await sheet.getByRole("combobox", { name: "Course" }).selectOption("10 km");
  await sheet.getByLabel("Date").fill("2026-11-22");
  await expect(sheet).toContainText("Ta semaine devient une semaine de course");
  await sheet.getByRole("button", { name: "Valider" }).click();
  const changed = banner(page, "Objectif modifié");
  await expect(changed).toBeVisible();

  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(sunday).toContainText("Jour J");
  expect(await week.allInnerTexts()).not.toEqual(thisWeek);

  await changed.getByRole("button", { name: "Annuler" }).click();
  await expect(banner(page, "Changement annulé")).toBeVisible();
  await expect(sunday).not.toContainText("Jour J");
  expect(await week.allInnerTexts()).toEqual(thisWeek);
});
