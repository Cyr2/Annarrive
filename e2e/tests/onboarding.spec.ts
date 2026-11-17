import { expect, onFresh, test } from "../support/test.ts";

onFresh();

test("onboarding d'une base vide jusqu'à la première semaine, puis visite guidée passée et plus jamais montrée", async ({
  page,
}) => {
  // The empty rest day must never show before the onboarding (audit fluidité F7).
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector("h1")?.textContent === "Repos") document.documentElement.dataset.sawRest = "";
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  const next = page.getByRole("button", { name: "Continuer", exact: true });
  await page.getByRole("button", { name: "Commencer" }).click();
  expect(await page.evaluate(() => "sawRest" in document.documentElement.dataset)).toBe(false);

  await expect(page.getByRole("heading", { name: "Ta course" })).toBeVisible();
  await page.getByRole("button", { name: "Semi", exact: true }).click();
  await page.getByLabel("Date").fill("2027-03-14");
  await next.click();
  await expect(page.getByRole("heading", { name: "Ton chrono" })).toBeVisible();
  await page.getByRole("radio", { name: "La finir" }).click();
  await next.click();
  await expect(page.getByRole("heading", { name: "Ta semaine" })).toBeVisible();
  await page.getByRole("button", { name: /^4/ }).click();
  await next.click();
  await expect(page.getByRole("heading", { name: "Tes horaires" })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Ta muscu" })).toBeVisible();
  await page.getByRole("button", { name: "Passer cette étape" }).click();
  await expect(page.getByRole("heading", { name: "Ta santé" })).toBeVisible();
  await next.click();
  await expect(page.getByText("Pas encore relié.", { exact: false })).toBeVisible();
  await next.click();
  await expect(page.getByRole("heading", { name: "Ton plan est prêt" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Récapitulatif" })).toContainText("4 par semaine");
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
