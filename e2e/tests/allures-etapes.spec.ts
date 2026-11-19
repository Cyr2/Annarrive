import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Détail de séance : étapes comme sur la montre, une allure avec son unité partout, et « En parler avec Reggie »", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^Détail de la séance/ }).click();
  const sheet = page.getByRole("dialog").last();
  const steps = sheet.locator("ol").first();
  await expect(steps).toContainText(/Répéter \d+ fois/);
  await expect(sheet).not.toContainText("Ressenti");
  // Every line of the list, inside a repeat too, has its pace with « /km ».
  for (const line of await steps.locator("li:not(.step-repeat)").all())
    await expect(line).toContainText(/\d'\d\d.*\/km/);

  await sheet
    .getByRole("region", { name: "Pourquoi cette séance" })
    .getByRole("button", { name: "En parler avec Reggie" })
    .click();
  await expect(page).toHaveURL(/\/reggie$/);
  // Sent once, not twice (the day's history is read before the question).
  await expect(page.getByText(/Pourquoi cette séance de .+\s\?\sÀ quoi elle me sert/)).toHaveCount(1);
  // Reggie's answer streams on: the next test must not inherit it.
  await page.unrouteAll({ behavior: "ignoreErrors" });
});

test("Programme : un nouveau nombre de courses s'annule comme tout changement, et la semaine revient telle quelle", async ({
  page,
}) => {
  await page.goto("/semaine");
  const week = page.getByRole("main");
  await expect(week).toContainText(/\d+ min/);
  const before = await week.innerText();
  await page.getByRole("link", { name: "Programme" }).click();
  const runs = page.getByRole("button", { name: /^Courses par semaine/ });
  const count = (await runs.innerText()).replace(/\D/g, "");
  await runs.click();
  const sheet = page.getByRole("dialog", { name: "Courses par semaine" });
  await sheet.getByRole("radio", { name: count === "5" ? "4" : "5" }).click();
  await sheet.getByRole("button", { name: "Enregistrer" }).click();

  const changed = banner(page, "Reggie a réorganisé ta semaine");
  await expect(changed).toBeVisible();
  await expect(changed).not.toContainText("déplacée");
  await changed.getByRole("button", { name: "Annuler" }).click();
  await expect(banner(page, "Changement annulé")).toBeVisible();
  await expect(runs).toContainText(count);
  await page.getByRole("link", { name: "Semaine" }).click();
  await expect.poll(() => week.innerText()).toBe(before);
});

test("Programme : chaque réglage s'ouvre en feuille et ne change rien avant Enregistrer, la bulle du verdict bloque la page", async ({
  page,
}) => {
  await page.goto("/programme");
  // A choice in a setting's sheet changes nothing until Enregistrer: closing it leaves the plan as it was.
  const runs = page.getByRole("button", { name: /^Courses par semaine/ });
  const before = await runs.innerText();
  await runs.click();
  const sheet = page.getByRole("dialog", { name: "Courses par semaine" });
  await sheet.getByRole("radio", { name: before.includes("5") ? "4" : "5" }).click();
  await expect(sheet.getByRole("button", { name: "Enregistrer" })).toBeEnabled();
  await sheet.getByRole("button", { name: "Annuler" }).click();
  await expect(sheet).toBeHidden();
  await expect(runs).toContainText(before.replace(/\D/g, ""));
  await expect(banner(page, "Reggie a réorganisé ta semaine")).toHaveCount(0);

  const longDays = page.getByRole("button", { name: /^Sortie longue/ });
  await expect(longDays).toContainText("Dimanche");
  await longDays.click();
  const long = page.getByRole("dialog", { name: "Sortie longue" });
  await long.getByRole("button", { name: "Sam", exact: true }).click();
  await long.getByRole("button", { name: "Dim", exact: true }).click();
  await long.getByRole("button", { name: "Sam", exact: true }).click();
  // No day left: nothing to save.
  await expect(long.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  await long.getByRole("button", { name: "Annuler" }).click();
  await expect(long).toBeHidden();

  await page.getByRole("button", { name: /^Ton dernier chrono/ }).click();
  const last = page.getByRole("dialog", { name: "Ton dernier chrono" });
  await last.getByLabel("Heures").fill("1");
  await last.getByLabel("Minutes").fill("50");
  await last.getByRole("button", { name: "Enregistrer" }).click();
  const recomputed = banner(page, "Allures recalculées avec ton chrono");
  await expect(recomputed).toBeVisible();
  await expect(page.getByRole("button", { name: /^Ton dernier chrono/ })).toContainText("Semi-marathon en 1:50:00");
  await recomputed.getByRole("button", { name: "Annuler" }).click();

  const card = page.getByRole("article", { name: "Ton objectif" });
  await card.getByRole("button", { name: "Modifier l'objectif" }).click();
  const goal = page.getByRole("dialog", { name: "Ton objectif" });
  await goal.getByRole("radio", { name: "Viser un chrono" }).click();
  await goal.getByLabel("Heures").fill("1");
  await goal.getByLabel("Minutes").fill("40");
  await goal.getByRole("button", { name: "Valider" }).click();
  await expect(goal).toBeHidden();
  await card.getByRole("button", { name: /Ambitieux|Atteignable/ }).click();
  const why = page.getByRole("dialog", { name: /^Pourquoi/ });
  await expect(why).toBeVisible();
  const overflow = () => page.evaluate(() => getComputedStyle(document.documentElement).overflow);
  expect(await overflow()).toBe("hidden");
  await why.getByRole("button", { name: "OK" }).click();
  await expect(why).toBeHidden();
  expect(await overflow()).not.toBe("hidden");

  // Back to « Juste finir », as the other tests expect it.
  await card.getByRole("button", { name: "Modifier l'objectif" }).click();
  await goal.getByRole("radio", { name: "Juste finir" }).click();
  await goal.getByRole("button", { name: "Valider" }).click();
  await expect(goal).toBeHidden();
});
