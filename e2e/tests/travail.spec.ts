import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

test("ajouter un travail certaines semaines déplace la course qu'il couvre, et Annuler la remet", async ({ page }) => {
  await page.goto("/semaine");
  const thursday = page.locator("#day-2026-11-19");
  const footing = thursday.getByRole("button", { name: /Footing/ });
  await expect(footing).toBeVisible();

  await page.getByRole("button", { name: "Ajouter" }).click();
  const add = page.getByRole("dialog", { name: "Ajouter" });
  await add.getByRole("radio", { name: "Travail" }).click();
  await add.getByRole("textbox", { name: "Titre" }).fill("Coaching");
  // Today, Tuesday, is picked first: her work is on Thursdays.
  await add.getByRole("button", { name: "Mar", exact: true }).click();
  await add.getByRole("button", { name: "Jeu", exact: true }).click();
  await add.getByLabel("Début").fill("16:00");
  await add.getByLabel("Fin").fill("21:00");
  await add.getByLabel("Répéter").selectOption("weeks");
  await add.getByRole("button", { name: /Semaines/ }).click();

  const weeks = page.getByRole("dialog", { name: "Quelles semaines ?" });
  await weeks.getByRole("button", { name: /23 au 29 novembre/ }).click();
  await weeks.getByRole("button", { name: "OK, 2 semaines" }).click();
  await add.getByRole("switch", { name: "Travail physique" }).click();
  await add.getByRole("button", { name: "Ajouter le travail" }).click();

  const added = banner(page, /Travail ajouté/);
  // This Thursday and the next: one run moved or two, said in the banner.
  await expect(added).toContainText(/passé à|déplacées/);
  const work = thursday.getByRole("button", { name: /Coaching/ });
  await expect(work).toContainText("21:00");
  await expect(work).toContainText("Travail physique");
  await expect(footing).toHaveCount(0);

  await added.getByRole("button", { name: "Annuler" }).click();
  await expect(work).toHaveCount(0);
  await expect(footing).toBeVisible();
});
