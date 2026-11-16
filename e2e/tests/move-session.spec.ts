import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

test("déplacer la séance du jour vers un créneau proposé, puis Annuler la remet en place", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article").first();
  await expect(card).toContainText("Ce soir · 17:00");
  await expect(card).toContainText("Sortie longue");

  await page.getByRole("button", { name: "Déplacer", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Déplacer" });
  const slots = sheet.getByRole("group", { name: "Créneaux proposés" }).getByRole("button");
  await expect(slots.first()).toBeVisible();
  await slots.last().click();
  await expect(slots.last()).toHaveAttribute("aria-pressed", "true");
  await sheet.getByRole("button", { name: /^Déplacer à/ }).click();

  const moved = banner(page, "Séance déplacée à");
  await expect(moved).toBeVisible();
  await expect(sheet).toBeHidden();
  await expect(card).not.toContainText("Ce soir · 17:00");

  await moved.getByRole("button", { name: "Annuler" }).click();
  await expect(card).toContainText("Ce soir · 17:00");
  await expect(card).toContainText("Sortie longue");
});
