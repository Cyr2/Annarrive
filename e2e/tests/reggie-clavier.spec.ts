import { expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

/** Reggie answers at once, so the suggestions come back after each message. */
const quickReggie = (page: Page) =>
  page.route("**/api/chat", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    const message = {
      id: `r${Date.now()}`,
      at: new Date().toISOString(),
      role: "reggie",
      text: "Bien noté.",
      widgets: [],
    };
    return route.fulfill({
      contentType: "text/event-stream",
      body: `event: x\ndata: ${JSON.stringify({ type: "done", message })}\n\n`,
    });
  });

/** The keyboard as iOS shows it: the visual viewport shrinks (and may pan), the layout viewport keeps its height. */
const iosKeyboard = (page: Page, keyboard: number, offsetTop = 0) =>
  page.evaluate(
    ({ keyboard, offsetTop }) => {
      const viewport = window.visualViewport;
      if (!viewport) throw new Error("visualViewport expected");
      const height = document.documentElement.clientHeight - keyboard;
      Object.defineProperty(viewport, "height", { configurable: true, get: () => height });
      Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => offsetTop });
      viewport.dispatchEvent(new Event("resize"));
      viewport.dispatchEvent(new Event("scroll"));
    },
    { keyboard, offsetTop },
  );

const bottomOf = async (page: Page) => {
  const box = await page.getByRole("region", { name: "Écrire à Reggie" }).boundingBox();
  return (box?.y ?? 0) + (box?.height ?? 0);
};

test("Reggie : une suggestion et Envoyer marchent d'un seul geste, le champ gardant le clavier", async ({ page }) => {
  await quickReggie(page);
  await page.goto("/reggie");
  const composer = page.getByRole("region", { name: "Écrire à Reggie" });
  const field = composer.getByRole("textbox", { name: "Message pour Reggie" });
  const log = page.getByRole("log", { name: "Conversation avec Reggie" });

  // Not typing: the field floats above the tab bar.
  const tabs = await page.getByRole("navigation", { name: "Navigation principale" }).boundingBox();
  expect(await bottomOf(page)).toBeLessThanOrEqual(tabs?.y ?? 0);

  await field.click();
  await composer.getByRole("button", { name: "Plus court" }).click();
  await expect(log).toContainText("Plus court");
  await expect(field).toBeFocused();

  await field.fill("Merci Reggie");
  await composer.getByRole("button", { name: "Envoyer" }).click();
  await expect(log).toContainText("Merci Reggie");
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("");
});

test("Reggie : sur iPhone, le champ se pose sur le clavier et y reste quand la page défile", async ({ page }) => {
  await page.goto("/reggie");
  const field = page.getByRole("textbox", { name: "Message pour Reggie" });
  await field.click();
  const height = await page.evaluate(() => document.documentElement.clientHeight);

  await iosKeyboard(page, 300);
  await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeHidden();
  await expect.poll(() => bottomOf(page)).toBeCloseTo(height - 300 - 8, 0);
  // iOS pans what is visible down inside the page: the field follows, still on the keyboard.
  await iosKeyboard(page, 300, 120);
  await expect.poll(() => bottomOf(page)).toBeCloseTo(height - 300 + 120 - 8, 0);

  await field.blur();
  await expect.poll(() => bottomOf(page)).toBeLessThan(height - 94 + 1);
});
