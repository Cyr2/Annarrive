import { expect, onMonday, test } from "../support/test.ts";

onMonday();

// Audit parcours réel B1: onboarded on a Monday evening, she first saw last week's review, « 0 sur 0 course ».
test("onboarding un lundi soir : Aujourd'hui ne montre aucun bilan de la semaine d'avant l'app", async ({ page }) => {
  // F4: an empty « Heure préférée » sent « 00000 » to the time field.
  const warnings: string[] = [];
  page.on("console", (m) => {
    if (m.text().includes("does not conform")) warnings.push(m.text());
  });
  await page.goto("/");
  const next = page.getByRole("button", { name: "Continuer", exact: true });
  const title = (name: string) => page.getByRole("heading", { level: 1, name });
  await page.getByRole("button", { name: "Commencer" }).click();

  await expect(title("Ta course")).toBeVisible();
  await page.getByRole("button", { name: /^Semi-marathon/ }).click();
  await page.getByLabel("Date").fill("2027-04-11");
  await next.click();

  await expect(title("Ta dernière course")).toBeVisible();
  await page.getByRole("button", { name: "10 km", exact: true }).last().click();
  await page.getByLabel("Minutes").last().fill("52");
  await page.getByLabel("Il y a", { exact: true }).last().selectOption("4 mois");
  await next.click();

  // Her hour left automatic.
  await expect(title("Ta semaine")).toBeVisible();
  await next.click();
  await expect(title("Tes journées")).toBeVisible();
  await next.click();
  await expect(title("Ta montre et tes accords")).toBeVisible();
  await page.getByRole("button", { name: "Préparer ma semaine" }).click();
  await expect(title("Ta semaine est prête")).toBeVisible();
  await page.getByRole("button", { name: "Voir aujourd'hui" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("region", { name: "Ton bilan de la semaine" })).toHaveCount(0);
  await expect(page.getByText("sur 0")).toHaveCount(0);
  expect(warnings).toEqual([]);
});
