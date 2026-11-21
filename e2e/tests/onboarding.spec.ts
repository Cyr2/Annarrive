import { icsUrl } from "../support/server.ts";
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

  await expect(page.getByRole("heading", { name: "Ton objectif" })).toBeVisible();
  await page.getByRole("button", { name: "Semi-marathon", exact: true }).click();
  await page.getByLabel("Date").fill("2027-03-14");
  await next.click();
  await expect(page.getByRole("heading", { name: "Ton dernier chrono" })).toBeVisible();
  // The race screen is still sliding out: the new one is the last.
  await page.getByRole("button", { name: "10 km", exact: true }).last().click();
  await page.getByLabel("Minutes").fill("52");
  await page.getByLabel("Quand").selectOption("Il y a 3 à 6 mois");
  await next.click();
  await expect(page.getByRole("heading", { name: "Ton chrono" })).toBeVisible();
  await page.getByRole("radio", { name: "Juste finir" }).click();
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
  // The link pasted here was dropped by the profile patch (audit onboarding 1).
  await page.getByLabel("Lien de l'emploi du temps").fill(icsUrl("timetable.ics"));
  await next.click();
  await expect(page.getByRole("heading", { name: "Tout est bon ?" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Récapitulatif" })).toContainText("4 par semaine");
  await expect(page.getByRole("region", { name: "Récapitulatif" })).toContainText("10 km en 52 min");
  await expect(page.getByRole("region", { name: "Récapitulatif" })).toContainText("Lien ajouté");
  await page.getByRole("button", { name: "C'est parti" }).click();

  const tour = page.getByRole("dialog", { name: "Visite guidée" });
  await expect(tour).toBeVisible();
  // Day one is a rest day: the tour points at the next session, and the rest day speaks of the plan to come.
  await expect(tour).toContainText("Ta prochaine séance");
  await expect(page.getByText("Ton plan commence avec la séance juste en dessous.")).toBeVisible();
  await tour.getByRole("button", { name: "Passer" }).click();
  await expect(tour).toBeHidden();

  // The first week is there: the day on Aujourd'hui (a run or rest), runs in Semaine.
  const day = page.getByRole("button", { name: "Déplacer" }).or(page.getByRole("heading", { name: "Repos" }));
  await expect(day).toBeVisible();
  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.locator("[aria-roledescription='séance déplaçable']").first()).toBeVisible();
  // Her classes are in the first week, and Réglages shows the link she pasted.
  await expect(page.locator("#day-2026-11-19")).toContainText("Biochimie");
  await page.getByRole("link", { name: "Programme" }).click();
  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(page.getByRole("button", { name: /^Lien ICS/ })).toContainText("ics.e2e.test");

  // Neither on the next launch, nor once Safari has dropped its storage: the server knows it is done.
  for (const forget of [false, true]) {
    if (forget) await page.evaluate(() => localStorage.clear());
    await page.goto("/");
    await expect(day).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("button", { name: "Commencer" })).toHaveCount(0);
    await expect(tour).toHaveCount(0);
  }
});
