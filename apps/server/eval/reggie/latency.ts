/**
 * Times 5 typical messages sent one after the other in the same conversation, as Anna would. Columns: the model's
 * first word, the first word of the answer (after his last tool call), the first word on screen, the whole reply.
 * Spends the account's quota. REGGIE_COLD=1 starts a new process per message, as before the warm spare.
 *   pnpm --filter @annarrive/server eval:latency
 */

import type { ChatContext } from "@annarrive/protocol";
import { query, startup } from "@anthropic-ai/claude-agent-sdk";
import { createReggie, type ReggieRun } from "../../src/reggie/agent.ts";
import { seeded } from "./run.ts";

const tonight: ChatContext = { screen: "today", sessionId: "tonight" };
const MESSAGES: { text: string; context?: ChatContext }[] = [
  { text: "Pourquoi cette allure ?", context: tonight },
  { text: "Pas le temps ce soir.", context: tonight },
  { text: "Je cours à quelle allure dimanche pour ma sortie longue ?" },
  { text: "Qui voit mes données ?" },
  { text: "Je suis crevée aujourd'hui, j'ai très mal dormi.", context: tonight },
];

let modelFirst: number | null = null;
let answerFirst: number | null = null;
const reggie = createReggie(query, process.env, process.env.REGGIE_COLD ? undefined : startup);
async function* timed(input: Parameters<ReggieRun>[0]) {
  for await (const event of reggie(input)) {
    if (event.type === "text") {
      modelFirst ??= performance.now();
      answerFirst ??= performance.now();
    }
    if (event.type === "tool_call") answerFirst = null;
    yield event;
  }
}

const services = seeded({}, timed);
const rows: string[] = [];
for (const message of MESSAGES) {
  modelFirst = answerFirst = null;
  const start = performance.now();
  let screenFirst: number | null = null;
  for await (const event of services.chat.send(message)) if (event.type === "text") screenFirst ??= performance.now();
  const ms = (t: number | null) => (t === null ? "-" : String(Math.round(t - start)).padStart(6));
  rows.push(`${ms(modelFirst)}  ${ms(answerFirst)}  ${ms(screenFirst)}  ${ms(performance.now())}  ${message.text}`);
  // Anna reads the reply before she types again: the time a spare process has to start.
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
console.info(["modèle  réponse écran   total (ms)", ...rows].join("\n"));
process.exit(0);
