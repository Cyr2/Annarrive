import { expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Programme : l'objectif d'abord, puis la frise, Progression, Ton niveau, Ta dernière course et Réglages", async ({
  page,
}) => {
  await page.goto("/programme");
  await expect(page.getByRole("heading", { name: "Ton niveau" })).toBeVisible();
  // No gear above the goal card any more: the card is the first thing on the page.
  const order = await page.getByRole("article", { name: "Ton objectif" }).evaluate((goal) => {
    const marks = [
      goal,
      document.querySelector('[aria-label="Les phases de ton plan"]'),
      document.getElementById("progression-title"),
      document.getElementById("level-title"),
      [...document.querySelectorAll("button")].find((b) => b.textContent?.startsWith("Ta dernière course")),
      [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === "Réglages"),
    ];
    return marks.map((m) => (m ? Math.round(m.getBoundingClientRect().top + window.scrollY) : -1));
  });
  expect(order.every((top) => top >= 0)).toBe(true);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

test("Ton niveau : la carte ouvre le détail, avec Ton niveau puis Tes chronos possibles", async ({ page }) => {
  await page.goto("/programme");
  const card = page.locator("section", { has: page.getByRole("heading", { name: "Ton niveau", exact: true }) });
  await expect(card).toContainText("Allure seuil");
  await expect(card).toContainText("FC seuil");
  await card.getByRole("button", { name: "Voir le détail de ton niveau" }).click();
  const sheet = page.getByRole("dialog", { name: "Niveau et chronos" });
  await expect(sheet.getByRole("heading", { level: 2 })).toHaveText([
    "Niveau et chronos",
    "Ton niveau",
    "Tes chronos possibles",
  ]);
  for (const race of ["5 km", "10 km", "Semi", "Marathon"]) await expect(sheet).toContainText(race);
  await sheet.getByRole("button", { name: "OK" }).click();
  await expect(sheet).toBeHidden();
});
