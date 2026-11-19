import { expect, type Locator, onPlan, type Page, test } from "../support/test.ts";

onPlan();

declare global {
  interface Window {
    sheetGhosts: number;
  }
}

/**
 * A finger (the mouse, for WebKit and Chromium alike) pressed on `from`, moved by dx, dy, released. It presses
 * `top` px under the element's top, its middle by default.
 */
async function pull(page: Page, from: Locator, dx: number, dy: number, top?: number) {
  const box = await from.boundingBox();
  if (!box) throw new Error("Élément invisible");
  const x = box.x + box.width / 2;
  const y = box.y + (top ?? box.height / 2);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

const openRunDetail = async (page: Page) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^\d+:\d+.*Footing/ })
    .first()
    .click();
  const detail = page.getByRole("dialog", { name: "Footing" });
  // Risen: a finger lands where the sheet stands.
  await expect(detail).toHaveCSS("transform", "none");
  return detail;
};

test("changer d'onglet ouvre le nouvel écran en haut de page", async ({ page }) => {
  // Both screens already loaded, as on her phone after the first seconds: nothing shortens the page meanwhile.
  await page.goto("/programme");
  await expect(page.getByRole("article", { name: "Ton objectif" })).toBeVisible();
  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.locator("#day-2026-11-22")).toBeVisible();
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(200);
  await page.getByRole("link", { name: "Programme" }).click();
  await expect(page.getByRole("article", { name: "Ton objectif" })).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("une feuille se ferme en la tirant vers le bas depuis son contenu, pas seulement par sa poignée", async ({
  page,
}) => {
  const detail = await openRunDetail(page);
  // Under the header, on the session's card: the content is at its top.
  await pull(page, detail, 0, 260, 120);
  await expect(detail).toBeHidden();
  // A short pull springs back: the sheet stays.
  const again = await openRunDetail(page);
  await pull(page, again, 0, 40, 120);
  await expect(again).toBeVisible();
});

test("la page derrière une feuille reste immobile, feuille ouverte comme tirée", async ({ page }) => {
  // The page used to step back with the sheet: rescaling it redrew every glass card of the page at each frame.
  const detail = await openRunDetail(page);
  const main = page.locator("main");
  await expect(main).toHaveCSS("transform", "none");
  // Once risen, the app behind is out of reach.
  await expect(page.locator("#root")).toHaveAttribute("inert", "");
  const box = await detail.getByRole("heading", { name: "Footing" }).boundingBox();
  if (!box) throw new Error("Titre invisible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 80, { steps: 6 });
  await expect(main).toHaveCSS("transform", "none");
  await page.mouse.up();
});

test("une feuille n'est que du givre tant qu'elle bouge, et retrouve son verre une fois posée", async ({ page }) => {
  // A blur that moves is filtered again at every frame: on a phone, sheets with more content stuttered.
  await page.goto("/");
  await page
    .getByRole("button", { name: /^\d+:\d+.*Footing/ })
    .first()
    .click();
  const detail = page.getByRole("dialog", { name: "Footing" });
  await expect(detail).toHaveAttribute("data-moving", "");
  await expect(detail).toHaveCSS("transform", "none");
  await expect(detail).not.toHaveAttribute("data-moving");
  const box = await detail.getByRole("heading", { name: "Footing" }).boundingBox();
  if (!box) throw new Error("Titre invisible");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 6 });
  await expect(detail).toHaveAttribute("data-moving", "");
  // A short, slow pull springs back: the finger rests, then moves 1 px, so the release is no flick (a flick closes,
  // and a slow machine turned the quick moves above into one).
  await page.waitForTimeout(200);
  await page.mouse.move(box.x + box.width / 2, box.y + 61);
  await page.mouse.up();
  // Once it stands again, the glass is back.
  await expect(detail).not.toHaveAttribute("data-moving");
  await expect(detail).toBeVisible();
});

test("une feuille ouverte depuis une autre offre Retour, et tirer vers le bas ferme tout", async ({ page }) => {
  const detail = await openRunDetail(page);
  // Counts the copies of the sheet's content that played out, frosted, as another took its place.
  await page.evaluate(() => {
    window.sheetGhosts = 0;
    const seen = new Set<Element>();
    new MutationObserver(() => {
      const ghost = document.querySelector("[data-sheet-ghost]");
      if (!ghost || seen.has(ghost)) return;
      seen.add(ghost);
      window.sheetGhosts += ghost.parentElement?.hasAttribute("data-moving") ? 1 : 100;
    }).observe(document.body, { childList: true, subtree: true });
  });
  await detail.getByRole("button", { name: "Déplacer" }).click();
  const move = page.getByRole("dialog", { name: "Déplacer" });
  await expect(move).toBeVisible();
  await expect(detail).toBeHidden();

  // Pushed inside the sheet: the detail slid out as Déplacer slid in, frost meanwhile, then nothing is left.
  expect(await page.evaluate(() => window.sheetGhosts)).toBe(1);
  await expect(move.locator("[data-sheet-ghost]")).toHaveCount(0);
  await expect(move).not.toHaveAttribute("data-moving");

  await move.getByRole("button", { name: "Retour" }).click();
  await expect(move).toBeHidden();
  await expect(detail).toBeVisible();
  await expect(detail.locator("[data-sheet-ghost]")).toHaveCount(0);
  await expect(detail).toHaveCSS("overflow", "visible");

  await detail.getByRole("button", { name: "Changer" }).click();
  const change = page.getByRole("dialog", { name: "Changer" });
  await expect(change).toBeVisible();
  // Its height settled: the title stays under the finger.
  await expect(change.locator("[data-sheet-ghost]")).toHaveCount(0);
  await pull(page, change.getByRole("heading", { name: "Changer" }), 0, 260);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("Semaine : l'onglet Semaine touché à nouveau ramène à cette semaine, en haut de la page", async ({ page }) => {
  await page.goto("/semaine");
  const range = page.locator("p[aria-live]");
  await expect(range).toHaveText("16 au 22 novembre");
  // This week's range is in ink, like any other week's.
  await expect(range.locator("span").first()).not.toHaveCSS("color", "rgb(9, 103, 214)");
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await expect(range).toContainText("30 nov. au 6 déc.");
  await page.evaluate(() => scrollTo(0, 600));
  await page.getByRole("navigation", { name: "Navigation principale" }).getByRole("link", { name: "Semaine" }).click();
  await expect(range).toHaveText("16 au 22 novembre");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});

test("Ajouter : passer de Révision ou Occupée à Muscu change le choix sans fermer la feuille", async ({ page }) => {
  await page.goto("/semaine");
  await page.getByRole("button", { name: "Ajouter" }).click();
  const sheet = page.getByRole("dialog", { name: "Ajouter" });
  const type = sheet.getByRole("radiogroup", { name: "Type" });
  for (const other of ["Révision", "Occupée"]) {
    await type.getByRole("radio", { name: other }).tap();
    await expect(type.getByRole("radio", { name: other })).toBeChecked();
    await type.getByRole("radio", { name: "Muscu" }).tap();
    await expect(sheet).toBeVisible();
    await expect(type.getByRole("radio", { name: "Muscu" })).toBeChecked();
    await expect(sheet.getByRole("button", { name: "Nouvelle séance de muscu" })).toBeVisible();
  }
});

test("Semaine : glisser vers la gauche montre la semaine suivante, vers la droite la précédente", async ({ page }) => {
  await page.goto("/semaine");
  const range = page.locator("p[aria-live]");
  await expect(range).toHaveText("16 au 22 novembre");
  const days = page.locator("#day-2026-11-17");
  await pull(page, days, -220, 0);
  await expect(range).toContainText("23 au 29 novembre");
  await pull(page, page.locator("#day-2026-11-24"), 220, 0);
  await expect(range).toHaveText("16 au 22 novembre");
  // While the finger is down, the next week is already drawn beside this one and comes in with it.
  const anchor = await page.locator("#day-2026-11-18").boundingBox();
  if (!anchor) throw new Error("Jour invisible");
  await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + 10);
  await page.mouse.down();
  // Slowly, then still: a drag, not a flick.
  for (let dx = 10; dx <= 70; dx += 10) {
    await page.mouse.move(anchor.x + anchor.width / 2 - dx, anchor.y + 10);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  await page.mouse.move(anchor.x + anchor.width / 2 - 71, anchor.y + 10);
  const next = page.locator("[data-neighbour='1'] #day-2026-11-25");
  await expect(next).toBeAttached();
  const peek = await next.boundingBox();
  expect(peek?.x ?? 9999).toBeLessThan(page.viewportSize()?.width ?? 0);
  // Short of the threshold, it springs back: still this week, the weeks beside gone.
  await page.mouse.up();
  await expect(page.locator("[data-neighbour]")).toHaveCount(0);
  await expect(range).toHaveText("16 au 22 novembre");
  // A vertical move stays a scroll, never a turn.
  await pull(page, page.locator("#day-2026-11-18"), 10, 160);
  await expect(range).toHaveText("16 au 22 novembre");
});

test("Semaine : un filtre garde un seul type, et la plage de dates ramène à la semaine en cours", async ({ page }) => {
  await page.goto("/semaine");
  const range = page.locator("p[aria-live]");
  await expect(range).toHaveText("16 au 22 novembre");
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await expect(range).toContainText("23 au 29 novembre");
  await page.getByRole("button", { name: /revenir à cette semaine/ }).click();
  await expect(range).toHaveText("16 au 22 novembre");
  await expect(page.getByRole("button", { name: /revenir à cette semaine/ })).toHaveCount(0);

  const sessions = page.locator("[aria-roledescription='séance déplaçable']");
  await expect(sessions.first()).toBeVisible();
  await page.getByRole("button", { name: "Cours", exact: true }).click();
  await expect(sessions).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Cours", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tout", exact: true }).click();
  await expect(sessions.first()).toBeVisible();
});
