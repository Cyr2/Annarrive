import { expect, onPlan, test } from "../support/test.ts";

onPlan();

const sse = (event: object) => `event: x\ndata: ${JSON.stringify(event)}\n\n`;

/** The session the coach built for her ask (algo.md M14), as `request_session` hands it to the widget. */
const asked = {
  id: "2026-11-16-r0",
  type: "T",
  start: "2026-11-19T18:00",
  durMin: 45,
  steps: [
    { kind: "warmup", durMin: 15, zone: "E", target: { paceSKm: [368, 368] } },
    { kind: "work", durMin: 20, zone: "T", target: { paceSKm: [306, 306] } },
    { kind: "cooldown", durMin: 10, zone: "E", target: { paceSKm: [368, 368] } },
  ],
  rpeTarget: 7,
  priority: 2,
  status: "planned",
  manual: true,
  frozen: false,
  pilot: "pace",
};

// No model runs in E2E: Reggie's two answers are played back; the widgets, the buttons and Annuler are the app's.
test("Reggie : une séance demandée s'affiche, « Prendre celle-ci » l'enregistre, Annuler la retire", async ({
  page,
}) => {
  const sent: string[] = [];
  let undone = "";
  await page.route("**/api/changes/*/undo", (route) => {
    undone = new URL(route.request().url()).pathname;
    return route.fulfill({ json: { id: "req-1", summary: "Seuil prévu jeudi 18:00" } });
  });
  await page.route("**/api/chat", (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    sent.push(JSON.parse(route.request().postData() ?? "{}").text);
    const first = sent.length === 1;
    const message = {
      id: `r${sent.length}`,
      at: new Date().toISOString(),
      role: "reggie",
      text: first ? "Jeudi, ça passe : un seuil de 45 min à 18 h." : "C'est noté pour jeudi, tu peux annuler.",
      widgets: first
        ? [{ type: "session_request", session: asked }]
        : [{ type: "change", changeId: "req-1", summary: "Seuil prévu jeudi 18:00", warnings: [] }],
    };
    return route.fulfill({
      contentType: "text/event-stream",
      body: sse({ type: "typing" }) + sse({ type: "done", message }),
    });
  });

  await page.goto("/reggie");
  const field = page.getByRole("textbox", { name: "Message pour Reggie" });
  const log = page.getByRole("log", { name: "Conversation avec Reggie" });
  await field.fill("Je veux du seuil jeudi");
  await field.press("Enter");

  await expect(log).toContainText("Jeudi 19 · 18:00 · 45 min");
  await expect(log.getByRole("button", { name: "Non merci" })).toBeVisible();
  await log.getByRole("button", { name: "Prendre celle-ci" }).click();
  await expect.poll(() => sent).toEqual(["Je veux du seuil jeudi", "Prendre celle-ci"]);

  const card = log.getByLabel("Changement de ta semaine");
  await expect(card).toContainText("Seuil prévu jeudi 18:00");
  await card.getByRole("button", { name: "Annuler" }).click();
  await expect.poll(() => undone).toBe("/api/changes/req-1/undo");
});
