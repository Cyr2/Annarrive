import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

// The seeded server lives on a Tuesday with no race: the mock shows Sunday evening and race day.
test("Le bilan du dimanche s'affiche en haut d'Aujourd'hui, « × » le ferme et il reste fermé au rechargement", async ({
  page,
}) => {
  await page.goto("/?mock=bilan");
  const review = page.getByRole("region", { name: "Ton bilan de la semaine" });
  await expect(review).toContainText("4 sur 4");
  await expect(review).toContainText("plus rapide que prévu");
  await expect(review.getByRole("heading", { name: "La semaine prochaine" })).toBeVisible();
  // The normal day stays under it.
  await expect(page.getByText("Sortie longue faite")).toBeVisible();

  await review.getByRole("button", { name: "Fermer le bilan" }).click();
  await expect(review).toBeHidden();
  await page.reload();
  await expect(page.getByText("Sortie longue faite")).toBeVisible();
  await expect(page.getByRole("region", { name: "Ton bilan de la semaine" })).toBeHidden();
});

test("« Voir la semaine » du bilan ouvre Semaine sur la semaine suivante", async ({ page }) => {
  await page.goto("/?mock=bilan");
  await page.getByRole("link", { name: "Voir la semaine" }).click();
  await expect(page).toHaveURL(/\/semaine\?jour=/);
});

test("Après la course objectif, le résultat remplace la journée jusqu'à « Garder la forme », puis les footings", async ({
  page,
}) => {
  await page.goto("/?mock=course");
  const result = page.getByRole("article", { name: "Semi-marathon" });
  await expect(result).toContainText("1:47:32");
  await expect(result).toContainText("28 s sous ton objectif");
  await expect(result).toContainText("de mieux qu'en décembre");
  await expect(page.getByRole("img", { name: /Allure par tranche/ })).toBeVisible();

  await page.getByRole("button", { name: /Garder la forme/ }).click();
  await expect(banner(page, "Mode entretien")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Et maintenant ?" })).toBeHidden();
  await expect(page.getByText("Jour J fait")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demain" })).toBeVisible();
  await expect(page.getByText("Footing facile").first()).toBeVisible();
});
