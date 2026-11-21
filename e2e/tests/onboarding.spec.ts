import { icsUrl } from "../support/server.ts";
import { expect, onFresh, test } from "../support/test.ts";

onFresh();

test("onboarding d'une base vide jusqu'à Aujourd'hui, sans séance le premier jour, et plus jamais montré", async ({
  page,
  session,
}) => {
  // The empty rest day must never show before the onboarding (audit fluidité F7).
  await page.addInitScript(() => {
    new MutationObserver(() => {
      if (document.querySelector("h1")?.textContent === "Repos") document.documentElement.dataset.sawRest = "";
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  const next = page.getByRole("button", { name: "Continuer", exact: true });
  const title = (name: string) => page.getByRole("heading", { level: 1, name });
  await page.getByRole("button", { name: "Commencer" }).click();
  expect(await page.evaluate(() => "sawRest" in document.documentElement.dataset)).toBe(false);

  await expect(title("Ta course")).toBeVisible();
  await page.getByRole("button", { name: /^Semi-marathon/ }).click();
  await page.getByLabel("Date").fill("2027-03-14");
  // The target belongs to the race: typed here, judged here, saved with it.
  await page.getByLabel("Heures").fill("1");
  await page.getByLabel("Minutes").fill("48");
  await next.click();

  await expect(title("Ta dernière course")).toBeVisible();
  // The race screen is still sliding out: the new one is the last.
  await page.getByRole("button", { name: "10 km", exact: true }).last().click();
  await page.getByLabel("Minutes").last().fill("52");
  await page.getByLabel("Quand").selectOption("Il y a 3 à 6 mois");
  await next.click();

  await expect(title("Ta semaine")).toBeVisible();
  await page.getByRole("radio", { name: "4" }).click();
  await page.getByLabel("Heure préférée").fill("18:00");
  await next.click();

  await expect(title("Tes journées")).toBeVisible();
  // The link pasted here was dropped by the profile patch (audit onboarding 1).
  await page.getByLabel("Lien de l'emploi du temps").fill(icsUrl("timetable.ics"));
  await expect(page.getByLabel("Il me faut, heures et minutes")).toHaveValue("00:30");
  await next.click();

  await expect(title("Ta montre et tes accords")).toBeVisible();
  await expect(page.getByRole("switch", { name: "Sommeil et fréquence cardiaque" })).toBeVisible();
  await expect(page.getByText("Cycle", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: "Préparer ma semaine" }).click();

  await expect(title("Ta semaine est prête")).toBeVisible();
  await expect(page.getByText("Ton plan commence demain.", { exact: false })).toBeVisible();
  const program = await (await page.request.get("/api/program", { headers: { cookie: session } })).json();
  expect(program.goal).toMatchObject({ distanceM: 21097.5, date: "2027-03-14", targetMin: 108 });
  expect(program.declaredTime).toMatchObject({ distanceM: 10000, minutes: 52 });
  const profile = await (await page.request.get("/api/profile", { headers: { cookie: session } })).json();
  expect(profile).toMatchObject({ runsPerWeek: 4, preferredHour: "18:00", travelMin: 30, earliest: "07:00" });
  await page.getByRole("button", { name: "Voir aujourd'hui" }).click();

  // Aujourd'hui, a rest day: the plan starts tomorrow.
  const day = page.getByRole("heading", { name: "Repos" });
  await expect(day).toBeVisible();
  await expect(page.getByText("Ton plan commence avec la séance juste en dessous.")).toBeVisible();
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
  }
});
