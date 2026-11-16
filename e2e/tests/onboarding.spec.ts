import { expect, onFresh, test } from "../support/test.ts";

onFresh();

test("onboarding d'une base vide jusqu'à la première semaine, puis visite guidée passée et plus jamais montrée", async ({
  page,
}) => {
  await page.goto("/");
  const next = page.getByRole("button", { name: "Continuer", exact: true });
  await page.getByRole("button", { name: "Commencer" }).click();

  await expect(page.getByRole("heading", { name: "Ta course" })).toBeVisible();
  await page.getByRole("button", { name: "Semi", exact: true }).click();
  await page.getByLabel("Date").fill("2027-03-14");
  await next.click();
  await expect(page.getByRole("heading", { name: "Ton chrono visé" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Combien de courses par semaine ?" })).toBeVisible();
  await page.getByRole("button", { name: /^4/ }).click();
  await next.click();
  await expect(page.getByRole("heading", { name: "Tu te couches vers quelle heure ?" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Tes limites" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Ta muscu" })).toBeVisible();
  await page.getByRole("button", { name: "Plus tard" }).click();
  await expect(page.getByRole("heading", { name: "Une douleur en ce moment ?" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Tes données" })).toBeVisible();
  await next.click();
  await expect(page.getByText("Pas encore relié.", { exact: false })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Les notifications" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "C'est prêt" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Récapitulatif" })).toContainText("Courses par semaine4");
  await page.getByRole("button", { name: "C'est parti" }).click();

  const tour = page.getByRole("dialog", { name: "Visite guidée" });
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Passer" }).click();
  await expect(tour).toBeHidden();

  // The first week is there: the goal on Aujourd'hui, runs in Semaine.
  await expect(page.getByRole("link", { name: /Semi · J-117/ })).toBeVisible();
  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.locator("[aria-roledescription='séance déplaçable']").first()).toBeVisible();

  // Neither on the next launch, nor once Safari has dropped its storage: the server knows it is done.
  for (const forget of [false, true]) {
    if (forget) await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Semi · J-117/ })).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Commencer" })).toHaveCount(0);
    await expect(tour).toHaveCount(0);
  }
});
