import { expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

/** A finger pulling the page down by `distance` px; the app reads `touches` and the time of each event. */
async function pull(page: Page, distance: number) {
  await page.evaluate(async (distance) => {
    const send = (type: string, y: number) => {
      const event = new Event(type, { bubbles: true });
      Object.defineProperty(event, "touches", { value: type === "touchend" ? [] : [{ clientX: 200, clientY: y }] });
      document.body.dispatchEvent(event);
    };
    send("touchstart", 200);
    for (let step = 1; step <= 8; step++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      send("touchmove", 200 + (distance * step) / 8);
    }
    send("touchend", 200 + distance);
  }, distance);
}

test("tirer la page vers le bas relit l'emploi du temps, un petit tirage ne fait rien", async ({ page }) => {
  for (const path of ["/semaine", "/programme/reglages"]) {
    await page.goto(path);
    // The page is drawn once Actualiser, the same read for VoiceOver, is there.
    await expect(page.getByRole("button", { name: "Actualiser" })).toBeVisible();
    await pull(page, 60);
    await page.waitForTimeout(400);
    await expect(page.getByText(/Relu à l'instant/)).toHaveCount(0);
    await pull(page, 160);
    await expect(page.getByText(/Relu à l'instant/).first()).toBeVisible();
  }
});

test("Aujourd'hui n'a pas de ligne d'emploi du temps, mais tirer la page le relit", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Tout voir" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Actualiser" })).toHaveCount(0);
  const read = page.waitForRequest((r) => r.url().endsWith("/api/timetable/refresh") && r.method() === "POST");
  await pull(page, 160);
  await read;
});
