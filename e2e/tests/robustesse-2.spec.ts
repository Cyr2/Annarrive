import { expect, type Locator, onPlan, test } from "../support/test.ts";

// Audit robustesse-2 (.claude/validation/audit/robustesse-2.md): each test replays one finding.
onPlan();

/** Voice control finds a control by what it shows: its accessible name holds its visible text. */
async function namedByItsText(control: Locator) {
  // Spaces aside: WebKit and Chromium place them differently around a visually hidden part.
  const bare = (text: string) => text.replace(/\s+/g, "");
  const name = await control.evaluate((el) => el.getAttribute("aria-label") ?? el.textContent ?? "");
  expect(bare(name)).toContain(bare(await control.innerText()));
}

test("1. deux Retour rapprochés sur une feuille empilée ne descendent que d'un cran", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("article").first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Déplacer", exact: true }).click();
  const move = page.getByRole("dialog", { name: "Déplacer" });
  await expect(move).toBeVisible();
  await move.getByRole("button", { name: "Retour" }).dblclick();
  await expect(move).toBeHidden();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(page.url()).toContain(new URL(process.env.E2E_PLAN_URL ?? "http://x").host);
});

test("2. Déplacer sans effet de bord ne montre pas d'icône seule", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Déplacer", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Déplacer" });
  await expect(sheet.getByRole("button", { name: /^Déplacer : / })).toBeEnabled();
  const empty = await sheet
    .locator("p:has(svg)")
    .evaluateAll((lines) => lines.filter((line) => !line.textContent?.trim()).length);
  expect(empty).toBe(0);
});

test.describe("à 320 px", () => {
  test.use({ viewport: { width: 320, height: 640 } });

  test("4 et 5. un long mot reste dans sa bulle, un long message s'arrête à 2000 caractères", async ({ page }) => {
    const long = `https://exemple.fr/${"a".repeat(150)}`;
    const done = { id: "m1", at: new Date().toISOString(), role: "reggie", text: `Regarde ${long}`, widgets: [] };
    await page.route("**/api/chat", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({
            contentType: "text/event-stream",
            body: `event: x\ndata: ${JSON.stringify({ type: "done", message: done })}\n\n`,
          })
        : route.fallback(),
    );
    await page.goto("/reggie");
    const field = page.getByRole("region", { name: "Écrire à Reggie" }).getByRole("textbox", {
      name: "Message pour Reggie",
    });
    await field.fill(long);
    await field.press("Enter");
    await expect(page.getByRole("log")).toContainText("Regarde");
    const overflowing = await page
      .locator(".bubble-user, .bubble-reggie")
      .evaluateAll((bubbles) => bubbles.filter((b) => b.scrollWidth > b.clientWidth + 1).length);
    expect(overflowing).toBe(0);

    await field.fill("a".repeat(2500));
    await expect(field).toHaveValue("a".repeat(2000));
    await expect(page.getByText("Un message s'arrête à 2000 caractères.", { exact: false })).toBeVisible();
  });

  test("7 et 10. la frise donne 44 px par jour, nomme chaque jour par son texte, et tient à 200 %", async ({
    page,
  }) => {
    await page.goto("/");
    const days = page.locator("nav:has(a[aria-current=date]) a");
    await expect(days).toHaveCount(7);
    for (const box of await days.evaluateAll((links) => links.map((l) => l.getBoundingClientRect().width)))
      expect(box).toBeGreaterThanOrEqual(44);
    await namedByItsText(days.first());
    await namedByItsText(page.getByRole("button", { name: /^Parler à Reggie/ }).first());

    await page.addStyleTag({ content: "html { font-size: 200% !important; }" });
    const today = page.locator("a[aria-current=date]");
    const [link, disc] = await today.evaluate((a) => [
      a.getBoundingClientRect().width,
      (a.children[1] as HTMLElement).getBoundingClientRect().width,
    ]);
    expect(disc).toBeLessThanOrEqual(link ?? 0);
  });
});

test.describe("onboarding", () => {
  test("6. le Retour du système revient à l'étape d'avant", async ({ page }) => {
    await page.goto("/?mock&onboarding");
    await page.getByRole("button", { name: "Commencer" }).click();
    await page.getByRole("button", { name: "Semi-marathon", exact: true }).click();
    await page.getByLabel("Date").fill("2027-03-14");
    await page.getByRole("button", { name: "Continuer", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Ton dernier chrono" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Ton objectif" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Ton dernier chrono" })).toHaveCount(0);
    expect(page.url()).toContain("onboarding");
  });

  test("8. deux appuis rapprochés sur Continuer n'avancent que d'une étape", async ({ page }) => {
    await page.goto("/?mock&onboarding");
    await page.getByRole("button", { name: "Commencer" }).click();
    await page.getByRole("button", { name: "Semi-marathon", exact: true }).click();
    await page.getByLabel("Date").fill("2027-03-14");
    await page.getByRole("button", { name: "Continuer", exact: true }).dblclick();
    await expect(page.getByRole("heading", { name: "Ton dernier chrono" })).toBeVisible();
    await page.waitForTimeout(800);
    await expect(page.getByRole("heading", { name: "Ton dernier chrono" })).toBeVisible();
  });
});

test("9. toute la ligne d'un interrupteur le bascule", async ({ page }) => {
  await page.goto("/programme/reglages?mock");
  const sleep = page.getByRole("switch", { name: "Sommeil et fréquence cardiaque" });
  const before = await sleep.getAttribute("aria-checked");
  await page.getByText("Lus sur ta Garmin", { exact: false }).click();
  await expect(sleep).not.toHaveAttribute("aria-checked", before ?? "");
});

test("12 et 13. « Ta dernière course » refuse 0 h 05 sur un semi et ne pose « Quelle distance ? » qu'une fois", async ({
  page,
}) => {
  await page.goto("/programme");
  await page.getByRole("button", { name: /^Ta dernière course/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ta dernière course" });
  await sheet.getByRole("button", { name: "Semi", exact: true }).click();
  await sheet.getByLabel("Heures").fill("0");
  await sheet.getByLabel("Minutes").fill("5");
  await expect(sheet.getByRole("button", { name: "Enregistrer" })).toBeDisabled();
  await expect(sheet).toContainText("Ce chrono ne colle pas à cette distance");
  await expect(sheet.getByText("Quelle distance ?", { exact: true })).toHaveCount(1);
  await expect(sheet.getByRole("group", { name: "Quelle distance ?" })).toBeVisible();
});

test("13 et 15. « Tu l'as faite ? » garde un titre de page, « Comment c'était ? » n'est dit qu'une fois", async ({
  page,
}) => {
  await page.goto("/?mock=didyourun");
  await expect(page.getByRole("region", { name: "Tu l'as faite ?" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await page.getByRole("button", { name: "Oui, je l'ai faite" }).click();
  await expect(page.getByRole("group", { name: "Comment c'était ?" })).toBeVisible();
  await expect(page.getByText("Comment c'était ?", { exact: true })).toHaveCount(1);
});

test("14. deux signalements de suite ne montrent qu'un « Merci »", async ({ page }) => {
  await page.goto("/programme/reglages");
  const send = page.getByRole("button", { name: "Envoyer le signalement" });
  await send.click();
  await send.click();
  const thanks = page.locator("[data-sonner-toast]").filter({ hasText: "Merci" });
  await expect(thanks).toHaveCount(1);
  await page.waitForTimeout(400);
  await expect(thanks).toHaveCount(1);
});
