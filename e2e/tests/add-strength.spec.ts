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
  await sheet.getByRole("button", { name: "Sam", exact: true }).click();
  // The length on the native wheel, as a time of day is: 1 h by default, 1 h 30 now.
  const length = sheet.getByLabel("Durée, heures et minutes");
  await expect(length).toHaveValue("01:00");
  await length.fill("01:30");
  await expect(sheet.locator(".row").filter({ has: page.getByLabel("Durée, heures et minutes") })).toContainText(
    "1 h 30",
  );
  await sheet.getByRole("button", { name: "OK" }).click();

  const added = banner(page, "Muscu ajoutée");
  await expect(added).toBeVisible();
  // The long runs of this Sunday and the next are now less than 24 h after it: both move, and the banner says so (EV22).
  await expect(added).toContainText("2 courses déplacées : moins de 24 h après ta séance jambes");
  const saturday = page.locator("#day-2026-11-21").getByRole("button", { name: /Squats/ });
  await expect(saturday).toBeVisible();
  await expect(saturday).toContainText("Jambes");

  await added.getByRole("button", { name: "Annuler" }).click();
  await expect(saturday).toHaveCount(0);
});
