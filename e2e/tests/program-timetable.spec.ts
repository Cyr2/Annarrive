import { icsUrl } from "../support/server.ts";
import { expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Programme : changer le lien de l'emploi du temps le relit, puis Actualiser le relit encore", async ({ page }) => {
  await page.goto("/semaine");
  await expect(page.locator("#day-2026-11-19")).toContainText("Biochimie");

  await page.getByRole("link", { name: "Programme" }).click();
  const row = page.getByRole("button", { name: /^Lien ICS/ });
  const sheet = page.getByRole("dialog", { name: "Emploi du temps" });
  const link = sheet.getByRole("textbox", { name: "Lien ICS" });
  const save = sheet.getByRole("button", { name: "Enregistrer" });
  await row.click();
  await expect(link).toHaveValue(icsUrl("timetable.ics"));
  await link.fill(icsUrl("timetable-v2.ics"));
  await save.click();
  // The sheet closes once the link is stored; the new feed drops Thursday's class.
  await expect(sheet).toBeHidden();

  await page.getByRole("button", { name: "Actualiser" }).click();
  await expect(page.getByText(/^À jour/)).toBeVisible();

  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.locator("#day-2026-11-17")).toContainText("Anatomie");
  await expect(page.locator("#day-2026-11-19")).not.toContainText("Biochimie");

  // Puts the first link back for the other tests.
  await page.getByRole("link", { name: "Programme" }).click();
  await row.click();
  await link.fill(icsUrl("timetable.ics"));
  await save.click();
  await expect(sheet).toBeHidden();
});
