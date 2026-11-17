import { banner, expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

/** Pas dispo > Douleur > mollet > `level` sur 10, up to the summary; returns the sheet. */
async function reportCalfPain(page: Page, level: number) {
  await page.getByRole("button", { name: "Pas dispo", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Pas dispo" });
  await sheet.getByRole("button", { name: /^Douleur/ }).click();
  await sheet.getByRole("button", { name: "Continuer" }).click();
  await sheet.getByRole("button", { name: "Mollet" }).click();
  await sheet.getByRole("button", { name: "Continuer" }).click();
  const slider = sheet.getByRole("slider", { name: /combien sur 10/ });
  await slider.fill(String(level));
  await expect(slider).toHaveAttribute("aria-valuetext", `${level} sur 10`);
  return sheet;
}

test("douleur au mollet à 3 sur 10 : la séance du jour devient un footing facile", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article").first();
  await expect(card).toContainText("Côtes courtes");

  const sheet = await reportCalfPain(page, 3);
  await expect(sheet).toContainText("Pas de fractionné : footing tranquille ou vélo.");
  await sheet.getByRole("button", { name: "Continuer" }).click();
  await expect(sheet).toContainText("Ce qui change");
  await sheet.getByRole("button", { name: "Valider" }).click();

  const changed = banner(page, "Douleur notée");
  await expect(changed).toBeVisible();
  await expect(card).not.toContainText("Côtes courtes");
  await expect(card).toContainText(/Footing/);

  await changed.getByRole("button", { name: "Annuler" }).click();
  await expect(card).toContainText("Côtes courtes");
});

test("douleur au mollet à 6 sur 10 : repos conseillé, mais rien n'est bloqué", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article").first();
  await expect(card).toContainText("Côtes courtes");

  const sheet = await reportCalfPain(page, 6);
  await expect(sheet).toContainText("Repos ou vélo conseillé");
  await sheet.getByRole("button", { name: "Continuer" }).click();
  await sheet.getByRole("button", { name: "Valider" }).click();

  const changed = banner(page, "Douleur notée");
  await expect(changed).toBeVisible();
  // She can still run today, and every action stays open.
  await expect(card).toContainText("Ce soir");
  for (const action of ["Déplacer", "Changer", "Pas dispo"]) {
    await expect(page.getByRole("button", { name: action, exact: true })).toBeEnabled();
  }

  await changed.getByRole("button", { name: "Annuler" }).click();
  await expect(card).toContainText("Côtes courtes");
});
