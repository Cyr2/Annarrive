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
  // Audit iPhone G3: VoiceOver goes on with the day's card, not from the top of the page.
  await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
  await page.reload();
  await expect(page.getByText("Sortie longue faite")).toBeVisible();
  await expect(page.getByRole("region", { name: "Ton bilan de la semaine" })).toBeHidden();
});

// Audit parcours réel G4: on Monday « La semaine prochaine » listed the week starting today and pushed today's run down.
test("Le lundi, le bilan reste court au-dessus de la séance du jour, sans redonner la semaine qui commence", async ({
  page,
}) => {
  await page.goto("/?mock=lundi");
  const review = page.getByRole("region", { name: "Ton bilan de la semaine" });
  await expect(review).toContainText("4 sur 4");
  await expect(review.getByRole("heading", { name: "La semaine prochaine" })).toHaveCount(0);
  await expect(review.getByRole("link", { name: "Voir la semaine" })).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
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
  // The easy weeks come first whatever she picks: said once, above the two choices (algo.md MA6).
  await expect(page.getByText("D'abord deux semaines de footings faciles, quelle que soit la suite.")).toBeVisible();

  await page.getByRole("button", { name: /Garder la forme/ }).click();
  await expect(banner(page, "Mode entretien")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Et maintenant ?" })).toBeHidden();
  await expect(page.getByText("Jour J fait")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demain" })).toBeVisible();
  await expect(page.getByText("Footing facile").first()).toBeVisible();
  // Audit iPhone F2: the title says « Demain », the card only the time.
  await expect(page.locator('[data-tour="next"]')).not.toContainText("Demain");
});

// Audit iPhone G1: « Une nouvelle course » reopened the race she had just run, dated today, ready to be validated.
test("« Une nouvelle course » ouvre un objectif vierge, qui refuse une date passée", async ({ page }) => {
  await page.goto("/?mock=course");
  await page.getByRole("button", { name: /Une nouvelle course/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ton objectif" });
  await expect(sheet.getByLabel("Nom de la course")).toHaveValue("");
  await expect(sheet.getByLabel("Date")).toHaveValue("");
  await expect(sheet.getByRole("button", { name: "Semi-marathon" })).toHaveAttribute("aria-pressed", "true");
  const validate = sheet.getByRole("button", { name: "Valider" });
  await sheet.getByRole("radio", { name: "Juste finir" }).click();
  await expect(validate).toBeDisabled();
  await sheet.getByLabel("Date").fill("2020-03-01");
  await expect(validate).toBeDisabled();
  await sheet.getByLabel("Date").fill("2099-03-01");
  await expect(validate).toBeEnabled();
});
