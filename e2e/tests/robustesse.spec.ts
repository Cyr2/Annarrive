import { banner, expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Semaine et Programme disent quand leur lecture échoue, et Réessayer les charge", async ({ page }) => {
  // Aujourd'hui loads; the week after next and the profile (Programme only) do not.
  const down = /\/api\/(weeks\/2026-W49|profile)$/;
  await page.route(down, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"panne"}' }),
  );
  await page.goto("/");
  await expect(page.getByRole("article").first()).toBeVisible();

  await page.getByRole("link", { name: "Semaine" }).click();
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await page.getByRole("button", { name: "Semaine suivante" }).click();
  await expect(page.getByRole("heading", { name: "Semaine indisponible" })).toBeVisible();

  await page.getByRole("link", { name: "Programme" }).click();
  await expect(page.getByRole("heading", { name: "Programme indisponible" })).toBeVisible();
  await page.unroute(down);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("heading", { name: "Ton niveau" })).toBeVisible();
});

test("l'emploi du temps ou Garmin en panne laissent le plan s'afficher, seule leur ligne le dit", async ({ page }) => {
  await page.route(/\/api\/(timetable|watch)$/, (route) => route.fulfill({ status: 502, body: "" }));
  await page.route("**/api/first-screen", (route) => route.fulfill({ status: 404, body: "" }));
  await page.goto("/");
  await expect(page.getByRole("article").first()).toBeVisible();
  // The timetable's line lives on Semaine: Aujourd'hui has none (audit UX G2).
  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.getByText("Injoignable pour l'instant")).toBeVisible();
  await page.getByRole("link", { name: "Programme" }).click();
  await page.getByRole("button", { name: "Réglages" }).click();
  await expect(page.getByText("État inconnu")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tes courses" })).toBeVisible();
});

test("un double tap sur Déplacer à n'envoie qu'une fois, le bouton attend, Annuler reste", async ({ page }) => {
  const posts: string[] = [];
  await page.route("**/api/sessions/*/move", async (route) => {
    posts.push(route.request().url());
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fallback();
  });
  await page.goto("/");
  const card = page.getByRole("article").first();
  await page.getByRole("button", { name: "Déplacer", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Déplacer" });
  const go = sheet.getByRole("button", { name: /^Déplacer : / });
  await expect(go).toBeEnabled();
  await go.click();
  await expect(go).toBeDisabled();
  await go.click({ force: true });

  const moved = banner(page, /passée?s? à /);
  await expect(moved).toBeVisible();
  await expect(sheet).toBeHidden();
  expect(posts).toHaveLength(1);
  await moved.getByRole("button", { name: "Annuler" }).click();
  await expect(card).toContainText("Ce soir · 17:00");
});

test("un écran dont le fichier ne charge pas laisse l'app debout, et Réessayer le charge", async ({ page }) => {
  // Offline once the first screen is in: Semaine's file cannot come, not even at idle.
  await page.route(/\/assets\/WeekScreen-.*\.js$/, (route) => route.abort("internetdisconnected"));
  await page.goto("/");
  await expect(page.getByRole("article").first()).toBeVisible();
  await page.getByRole("link", { name: "Semaine" }).click();
  await expect(page.getByRole("heading", { name: "Écran indisponible" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Aujourd'hui" })).toBeVisible();

  await page.unroute(/\/assets\/WeekScreen-.*\.js$/);
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page.getByRole("button", { name: "Semaine suivante" })).toBeVisible();
});

test("hors ligne avant le premier bandeau : le message s'affiche quand même", async ({ page }) => {
  await page.route(/\/assets\/Toast-.*\.js$/, (route) => route.abort("internetdisconnected"));
  await page.route("**/api/sessions/*/change", (route) => route.fulfill({ status: 503, body: "" }));
  await page.goto("/");
  await page.getByRole("button", { name: "Changer", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Changer la séance" });
  await sheet.getByRole("button", { name: /^Valider/ }).click();
  await expect(page.getByRole("status").filter({ hasText: /Ça n.a pas marché/ })).toBeVisible();
  await expect(sheet).toBeVisible();
});

test("Retour ferme la feuille ouverte sans quitter l'écran", async ({ page }) => {
  await page.goto("/semaine");
  await page.getByRole("link", { name: "Aujourd'hui" }).click();
  await page.getByRole("button", { name: "Changer", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Changer la séance" });
  await expect(sheet).toBeVisible();
  await page.goBack();
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/$/);
  // A second Back now leaves the screen, as usual.
  await page.goBack();
  await expect(page).toHaveURL(/\/semaine$/);
});

test("Pas le temps mène à Déplacer sans refermer la feuille", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pas dispo", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: /Pas le temps/ }).click();
  const closed = page.evaluate(
    () =>
      new Promise<boolean>((resolve) => {
        const seen = setInterval(() => !document.querySelector('[role="dialog"]') && resolve(true), 5);
        setTimeout(() => {
          clearInterval(seen);
          resolve(false);
        }, 1500);
      }),
  );
  await sheet.getByRole("button", { name: "Continuer", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Déplacer" })).toBeVisible({ timeout: 500 });
  expect(await closed).toBe(false);
});

test("au retour sur l'app après une pause, le plan est relu sans écran vide", async ({ page }) => {
  await page.goto("/");
  const card = page.getByRole("article").first();
  await expect(card).toBeVisible();
  const title = await card.locator("h1, h2").first().textContent();
  const reads: string[] = [];
  page.on("request", (request) => request.url().endsWith("/api/today") && reads.push(request.url()));
  await page.clock.fastForward("02:00");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => reads.length).toBe(1);
  await expect(card).toContainText(title ?? "");
});

test.describe("réduire les animations", () => {
  test.use({ reducedMotion: "reduce" });
  test("la feuille apparaît en fondu, sans glisser", async ({ page }) => {
    await page.goto("/");
    const button = page.getByRole("button", { name: "Changer", exact: true });
    await button.waitFor();
    // The sampler starts before the tap: on a slow runner the 150 ms fade could end before a late sampler begins.
    const sampling = page.evaluate(
      () =>
        new Promise<{ opacity: number; transform: string }[]>((resolve) => {
          const out: { opacity: number; transform: string }[] = [];
          const tick = () => {
            const panel = document.querySelector<HTMLElement>('[role="dialog"]');
            if (panel) {
              const style = getComputedStyle(panel);
              out.push({ opacity: Number(style.opacity), transform: style.transform });
            }
            if (out.length < 12) requestAnimationFrame(tick);
            else resolve(out);
          };
          tick();
        }),
    );
    await button.click();
    const frames = await sampling;
    expect(frames.some((f) => f.opacity < 1)).toBe(true);
    expect(frames.every((f) => f.transform === "none")).toBe(true);
  });
});

test.describe("zoom 200 %", () => {
  test.use({ viewport: { width: 196, height: 426 } });
  for (const path of ["/", "/semaine", "/programme", "/programme/reglages"]) {
    test(`${path} ne défile pas à l'horizontale`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator("main [aria-busy='true']")).toHaveCount(0);
      expect(await page.evaluate(() => document.scrollingElement?.scrollWidth)).toBeLessThanOrEqual(196);
    });
  }
});
