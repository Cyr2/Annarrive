import { icsUrl } from "../support/server.ts";
import { expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Programme : changer le lien de l'emploi du temps le relit, puis Actualiser le relit encore", async ({ page }) => {
  await page.goto("/semaine");
  await expect(page.locator("#day-2026-11-19")).toContainText("Biochimie");

  await page.getByRole("link", { name: "Programme" }).click();
  const link = page.getByRole("textbox", { name: "Lien ICS" });
  await expect(link).toHaveValue(icsUrl("timetable.ics"));
  await link.fill(icsUrl("timetable-v2.ics"));
  const save = page.getByRole("button", { name: "Enregistrer" });
  await save.click();
  // Saved once the link is the stored one; the new feed drops Thursday's class.
  await expect(save).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveCount(0);

  await page.getByRole("button", { name: "Actualiser" }).click();
  await expect(page.getByText(/^À jour/)).toBeVisible();

  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.locator("#day-2026-11-17")).toContainText("Anatomie");
  await expect(page.locator("#day-2026-11-19")).not.toContainText("Biochimie");

  // Puts the first link back for the other tests.
  await page.getByRole("link", { name: "Programme" }).click();
  await link.fill(icsUrl("timetable.ics"));
  await save.click();
  await expect(save).toBeDisabled();
});
