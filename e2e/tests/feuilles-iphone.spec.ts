import { expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

declare global {
  interface Window {
    /** Every height animation of a sheet: where it went. */
    sheetHeights: string[];
  }
}

const openRunDetail = async (page: Page) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: /^\d+:\d+.*Footing/ })
    .first()
    .click();
  const detail = page.getByRole("dialog", { name: "Footing" });
  await expect(detail).toHaveCSS("transform", "none");
  return detail;
};

for (const [name, title, ready] of [
  ["Déplacer", "Déplacer", "Créneaux proposés"],
  ["Changer", "Changer la séance", "Nouvelle séance"],
] as const) {
  test(`pousser ${name} dans la feuille mène sa hauteur à la bonne taille d'un seul mouvement, sans à-coup`, async ({
    page,
  }) => {
    // Notes where each height animation of a sheet goes. Headless frames are too far apart to sample the motion.
    await page.addInitScript(() => {
      window.sheetHeights = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (this: Element, keyframes, options) {
        const frames = Array.isArray(keyframes) ? keyframes : [];
        const end = frames.at(-1)?.height;
        if (this.getAttribute("role") === "dialog" && typeof end === "string") window.sheetHeights.push(end);
        return animate.call(this, keyframes, options);
      };
    });
    const detail = await openRunDetail(page);
    // The options arrive during the push, as on a phone's network: it starts on their waiting state.
    await page.route(/\/api\/sessions\/[^/]+\/(slots|options)$/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      await route.fallback();
    });
    await detail.getByRole("button", { name }).click();
    const sheet = page.getByRole("dialog", { name: title });
    await expect(sheet.getByRole("group", { name: ready })).toBeVisible();
    await expect(sheet.locator("[data-sheet-ghost]")).toHaveCount(0);
    await expect.poll(() => sheet.evaluate((element) => element.getAnimations().length)).toBe(0);
    // Its final height is where its last animation took it: it was never set in a jump.
    const final = await sheet.evaluate((element) => `${(element as HTMLElement).offsetHeight}px`);
    expect(await page.evaluate(() => window.sheetHeights.at(-1))).toBe(final);
  });
}

const openStrength = async (page: Page) => {
  await page.goto("/programme/reglages");
  await page
    .getByRole("button", { name: /Jambes/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Séance de muscu" });
  await expect(sheet).toHaveCSS("transform", "none");
  return sheet;
};

test("glisser l'interrupteur d'une feuille ne tire pas la feuille avec lui", async ({ page }) => {
  const sheet = await openStrength(page);
  const legs = sheet.getByRole("switch", { name: "Travaille les jambes" });
  const before = (await legs.getAttribute("aria-checked")) ?? "";
  const box = await legs.boundingBox();
  if (!box) throw new Error("Interrupteur invisible");
  // Notes any moment the sheet moved (frost on) while the thumb was dragged.
  await page.evaluate(() => {
    window.sheetHeights = [];
    const dialog = document.querySelector("[role=dialog]:not([hidden] *)");
    if (!dialog) return;
    new MutationObserver(() => {
      if (dialog.hasAttribute("data-moving")) window.sheetHeights.push("moving");
    }).observe(dialog, { attributes: true });
  });
  // A thumb's first move often drifts down before it slides across.
  const on = before === "true";
  const x = box.x + (on ? box.width - 8 : 8);
  const y = box.y + box.height / 2;
  const way = on ? -1 : 1;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + way * 2, y + 10, { steps: 3 });
  await page.mouse.move(x + way * 40, y + 12, { steps: 6 });
  await page.mouse.up();
  await expect(legs).not.toHaveAttribute("aria-checked", before);
  await expect(sheet).toHaveCSS("transform", "none");
  expect(await page.evaluate(() => window.sheetHeights)).toEqual([]);
  // Back as it was.
  await legs.click();
  await expect(legs).toHaveAttribute("aria-checked", before);
});

test("un champ touché reste visible au-dessus du clavier, sa feuille ne revient pas en haut", async ({ page }) => {
  await page.goto("/programme");
  await page
    .getByRole("article", { name: "Ton objectif" })
    .getByRole("button", { name: "Modifier l'objectif" })
    .click();
  const sheet = page.getByRole("dialog", { name: "Ton objectif" });
  await expect(sheet).toHaveCSS("transform", "none");
  await sheet.getByRole("radio", { name: "Viser un chrono" }).click();
  const hours = sheet.getByLabel("Heures");
  await hours.focus();
  // The keyboard comes up after the focus, as on the iPhone: the visible part of the page shrinks.
  const size = page.viewportSize();
  if (!size) throw new Error("Pas de fenêtre");
  await page.setViewportSize({ width: size.width, height: size.height - 330 });
  await expect(hours).toBeInViewport({ ratio: 1 });
  const body = sheet.locator("[data-sheet-part=body]");
  await expect
    .poll(async () => {
      const field = await hours.boundingBox();
      const view = await body.boundingBox();
      return Boolean(field && view && field.y + field.height <= view.y + view.height);
    })
    .toBe(true);
  await page.setViewportSize(size);
  await sheet.getByRole("button", { name: "Annuler" }).click();
});

test("supprimer demande confirmation dans une alerte, le bouton Supprimer ne change pas", async ({ page }) => {
  const sheet = await openStrength(page);
  const remove = sheet.getByRole("button", { name: "Supprimer la séance" });
  await remove.click();
  const alert = page.getByRole("dialog", { name: /^Supprimer .* \?$/ });
  await expect(alert).toBeVisible();
  await expect(alert.getByRole("button", { name: "Cette semaine et les suivantes" })).toBeVisible();
  await expect(alert.getByRole("button", { name: "Cette semaine seulement" })).toBeVisible();
  // The button that asked keeps its place and its meaning.
  await expect(remove).toBeVisible();
  await expect(alert.getByRole("button", { name: "Annuler" })).toBeFocused();
  // Escape cancels the alert only: the sheet stays.
  await page.keyboard.press("Escape");
  await expect(alert).toBeHidden();
  await expect(sheet).toBeVisible();
  await remove.click();
  await alert.getByRole("button", { name: "Annuler" }).click();
  await expect(alert).toBeHidden();
  await expect(sheet).toBeVisible();
});

test("arrêter le programme se confirme dans la même alerte", async ({ page }) => {
  await page.goto("/programme/reglages");
  await page.getByRole("button", { name: "Arrêter le programme" }).click();
  const alert = page.getByRole("dialog", { name: /^Arrêter ton plan/ });
  await expect(alert).toContainText("mode entretien");
  await expect(alert.getByRole("button", { name: "Arrêter le programme" })).toBeVisible();
  await alert.getByRole("button", { name: "Annuler" }).click();
  await expect(alert).toBeHidden();
});
