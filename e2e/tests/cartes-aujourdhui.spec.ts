import { expect, onPlan, test } from "../support/test.ts";

onPlan();

// The seeded server has no session that is over and unmatched, and no pending proposal: the mock shows both cards.
test("Aujourd'hui demande « Tu l'as faite ? » pour la course d'hier", async ({ page }) => {
  await page.goto("/?mock=didyourun");
  const card = page.getByRole("region", { name: "Tu l'as faite ?" });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Non, je l'ai sautée" }).click();
  await expect(card).toBeHidden();
});

test("L'explication d'une séance allégée, sur la carte du jour, mène à Reggie", async ({ page }) => {
  await page.goto("/?mock=light");
  const card = page.getByRole("article").filter({ hasText: "Allégée" });
  await card.getByRole("button", { name: "En parler avec Reggie" }).click();
  await expect(page).toHaveURL(/\/reggie/);
  await expect(page.getByText("Pourquoi ma séance est allégée ?")).toHaveCount(1);
});

test("Aujourd'hui montre la proposition de niveau de Reggie", async ({ page }) => {
  await page.goto("/?mock=proposal");
  const card = page.getByRole("region", { name: "Proposition de Reggie" });
  await expect(card).toContainText("allures un peu plus vives");
  await card.getByRole("button", { name: "Accepter" }).click();
  await expect(card).toBeHidden();
});
