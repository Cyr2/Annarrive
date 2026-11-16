import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

test("ajouter une séance de muscu « Travaille les jambes » depuis le + la place dans la semaine", async ({ page }) => {
  await page.goto("/semaine");
  await page.getByRole("button", { name: "Ajouter" }).click();
  await page.getByRole("dialog", { name: "Ajouter" }).getByRole("button", { name: "Nouvelle séance de muscu" }).click();

  const sheet = page.getByRole("dialog", { name: "Séance de muscu" });
  await sheet.getByRole("textbox", { name: "Nom" }).fill("Squats");
  const legs = sheet.getByRole("switch", { name: "Travaille les jambes" });
  await legs.click();
  await expect(legs).toBeChecked();
  await sheet.getByRole("combobox", { name: "Jour" }).selectOption({ label: "Samedi" });
  await sheet.getByRole("button", { name: "OK" }).click();

  const added = banner(page, "Muscu ajoutée");
  await expect(added).toBeVisible();
  const saturday = page.locator("#day-2026-11-21").getByRole("button", { name: /Squats/ });
  await expect(saturday).toBeVisible();
  await expect(saturday).toContainText("Jambes");

  await added.getByRole("button", { name: "Annuler" }).click();
  await expect(saturday).toHaveCount(0);
});
