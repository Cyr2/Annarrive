import { expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Reggie : la discussion du jour, puis les jours d'avant un par un", async ({ page }) => {
  await page.goto("/reggie");
  const log = page.getByRole("log", { name: "Conversation avec Reggie" });
  await expect(log).toContainText("Bien dormi cette nuit.");
  await expect(log).not.toContainText("Je cours avec une amie jeudi.");

  await page.getByRole("button", { name: "Voir la discussion d'hier" }).click();
  await expect(log).toContainText("Je cours avec une amie jeudi.");
  await expect(log.getByRole("heading")).toHaveText(["Hier", "Aujourd'hui"]);
  await expect(log).not.toContainText("sortie longue");

  await page.getByRole("button", { name: "Voir la discussion du 13 novembre" }).click();
  await expect(log).toContainText("Un repas léger 2 à 3 h avant.");
  await expect(log.getByRole("heading")).toHaveText(["Vendredi 13 novembre", "Hier", "Aujourd'hui"]);
  await expect(page.getByRole("button", { name: /Voir la discussion/ })).toHaveCount(0);
});

test("Reggie : pendant la saisie, la barre d'onglets s'efface et le champ reste au-dessus du clavier", async ({
  page,
}) => {
  await page.goto("/reggie");
  const field = page.getByRole("textbox", { name: "Message pour Reggie" });
  const tabs = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(tabs).toBeVisible();
  await field.click();
  // The keyboard, as Android shows it (interactive-widget=resizes-content): the window gets shorter.
  const size = page.viewportSize();
  if (!size) throw new Error("viewport expected");
  await page.setViewportSize({ width: size.width, height: size.height - 300 });
  await expect(tabs).toBeHidden();
  const box = await field.boundingBox();
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeGreaterThan(size.height - 300 - 40);
  await field.blur();
  await page.setViewportSize(size);
  await expect(tabs).toBeVisible();
});

test("Programme : le verdict de la cible s'explique, puis Reggie en parle", async ({ page }) => {
  await page.goto("/programme");
  const card = page.getByRole("article", { name: "Ton objectif" });
  const setTarget = async (finish: boolean) => {
    await card.getByRole("button", { name: "Modifier l'objectif" }).click();
    const sheet = page.getByRole("dialog", { name: "Ton objectif" });
    await sheet.getByRole("radio", { name: finish ? "Juste finir" : "Viser un chrono" }).click();
    if (!finish) {
      await sheet.getByLabel("Heures").fill("1");
      await sheet.getByLabel("Minutes").fill("20");
    }
    await sheet.getByRole("button", { name: "Valider" }).click();
    await expect(sheet).toBeHidden();
  };

  await setTarget(false);
  await card.getByRole("button", { name: "Ambitieux" }).click();
  const why = page.getByRole("dialog", { name: "Pourquoi ambitieux ?" });
  await expect(why).toContainText("Aujourd'hui, ton niveau te donne environ");
  await expect(why).toContainText("Ta cible va au-delà");
  const chat = page.waitForResponse((r) => r.url().endsWith("/api/chat") && r.request().method() === "POST");
  await why.getByRole("button", { name: "En parler avec Reggie" }).click();

  await expect(page).toHaveURL(/\/reggie$/);
  await expect(page.getByText("À propos de : Semi-marathon, 1:20:00")).toBeVisible();
  await expect(page.getByRole("log")).toContainText(
    "Pourquoi mon objectif est ambitieux ? Qu'est-ce que je peux faire ?",
  );
  // Reggie's stream ends before the next calls start, so none of them races its closing socket.
  await (await chat).finished();

  await page.getByRole("link", { name: "Programme" }).click();
  await setTarget(true);
  await expect(card.getByRole("button", { name: "Ambitieux" })).toHaveCount(0);
});
