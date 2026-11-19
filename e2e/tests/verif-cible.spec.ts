import { expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

const box = async (locator: ReturnType<Page["locator"]>) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("Élément invisible");
  return b;
};

test("Programme : le retour du système ferme la feuille du lien ICS et reste sur Programme", async ({ page }) => {
  await page.goto("/programme");
  const sheet = page.getByRole("dialog", { name: "Emploi du temps" });
  await page.getByRole("button", { name: /^Lien ICS/ }).click();
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  expect(new URL(page.url()).pathname).toBe("/programme");
});

test("la barre d'onglets reste le même repère avant et après le premier toucher", async ({ page }) => {
  await page.goto("/");
  const bar = page.locator("[role='navigation'][aria-label='Navigation principale']");
  await expect(bar).toHaveCount(1);
  const tag = () => bar.evaluate((el) => el.tagName);
  expect(await tag()).toBe("DIV");
  await page.mouse.click(5, 5);
  // glisse takes over after the first gesture.
  await page.waitForTimeout(1500);
  await expect(bar).toHaveCount(1);
  expect(await tag()).toBe("DIV");
});

test.describe("320 px", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("la frise de la semaine suit la même marge que les cartes", async ({ page }) => {
    await page.goto("/");
    const strip = page.getByRole("navigation", { name: "Cette semaine" });
    const card = page.getByRole("article").first();
    await expect(strip).toBeVisible();
    const s = await box(strip.locator("xpath=.."));
    const c = await box(card);
    expect(Math.round(s.x)).toBe(Math.round(c.x));
    expect(Math.round(s.x + s.width)).toBe(Math.round(c.x + c.width));
  });

  test("muscu : Supprimer la séance reste dans le pied de la feuille, sans défiler", async ({ page }) => {
    await page.goto("/programme");
    await page
      .getByRole("button", { name: /Jambes/ })
      .first()
      .click();
    const sheet = page.getByRole("dialog", { name: "Séance de muscu" });
    const remove = sheet.getByRole("button", { name: "Supprimer la séance" });
    await expect(remove).toBeVisible();
    // Risen: the sheet is where it stays.
    await expect(sheet).toHaveCSS("transform", "none");
    const b = await box(remove);
    expect(b.y + b.height).toBeLessThanOrEqual(640);
    // In the footer, outside the scrolling body.
    expect(await remove.evaluate((el) => Boolean(el.closest("fieldset.sheet-footer")))).toBe(true);
  });
});

test("muscu : h, min et OK ont une cible de 44 px au moins", async ({ page }) => {
  await page.goto("/programme");
  await page
    .getByRole("button", { name: /Jambes/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Séance de muscu" });
  await expect(sheet).toHaveCSS("transform", "none");
  for (const name of ["Heures", "Minutes"]) {
    const b = await box(sheet.getByRole("textbox", { name }));
    expect(b.width).toBeGreaterThanOrEqual(44);
    expect(b.height).toBeGreaterThanOrEqual(44);
  }
  // OK: its label is narrower, its hit area (a pseudo-element) reaches 44 px.
  const ok = sheet.getByRole("button", { name: "OK" });
  const b = await box(ok);
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest("button")?.textContent,
    [b.x - 5, b.y + b.height / 2],
  );
  expect(hit).toBe("OK");
});

test("le lien « Tout voir » du repos est d'un bleu lisible sur le ciel (4,5:1)", async ({ page }) => {
  await page.goto("/?mock=rest");
  const link = page.getByRole("link", { name: "Tout voir" });
  await expect(link).toHaveCSS("color", "rgb(8, 87, 184)");
});
