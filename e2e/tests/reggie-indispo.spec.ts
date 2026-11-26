import { expect, onPlan, test } from "../support/test.ts";

onPlan();

const sse = (event: object) => `event: x\ndata: ${JSON.stringify(event)}\n\n`;

// 25/11: Reggie at his limit, her message sent 8 times and « ? » 6 times without a word back.
test("Reggie indisponible : un seul message attend, Réessayer l'envoie de nouveau", async ({ page }) => {
  let posts = 0;
  await page.route("**/api/chat", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    posts += 1;
    const answer =
      posts < 3
        ? sse({ type: "error", error: "Reggie ne peut pas répondre pour l'instant, réessaie dans un moment." })
        : sse({
            type: "done",
            message: { id: "m1", at: new Date().toISOString(), role: "reggie", text: "Bien vu.", widgets: [] },
          });
    return route.fulfill({ contentType: "text/event-stream", body: sse({ type: "typing" }) + answer });
  });
  await page.goto("/reggie");
  const composer = page.getByRole("region", { name: "Écrire à Reggie" });
  const field = composer.getByRole("textbox", { name: "Message pour Reggie" });
  const log = page.getByRole("log", { name: "Conversation avec Reggie" });
  const said = "J'ai eu du mal à tenir l'allure";

  await field.fill(said);
  await field.press("Enter");
  const state = composer.getByRole("status");
  await expect(state).toHaveText(/Reggie ne peut pas répondre pour l'instant, réessaie dans un moment\./);

  // The same words again: still one bubble of hers.
  await field.fill(said);
  await field.press("Enter");
  await expect.poll(() => posts).toBe(2);
  await expect(state).toBeVisible();
  await expect(log.locator(".bubble-user", { hasText: said })).toHaveCount(1);

  await state.getByRole("button", { name: "Réessayer" }).click();
  await expect(log).toContainText("Bien vu.");
  await expect(state).toBeHidden();
  await expect(log.locator(".bubble-user", { hasText: said })).toHaveCount(1);
  expect(posts).toBe(3);
});
