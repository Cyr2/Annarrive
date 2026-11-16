/**
 * Runs the core scenarios (or the ids given) against the real model (REGGIE_MODEL, default sonnet) and prints a pass/fail table.
 * Spends the account's quota: run it on purpose, never in CI.
 *   pnpm --filter @talaria/server eval:reggie [scenario-id ...]
 */
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { ChatWidget } from "@talaria/protocol";
import { type CoachPort, passThroughCoach } from "../../src/coach-port.ts";
import { createReggie, type ReggieRun } from "../../src/reggie/agent.ts";
import { createServices } from "../../src/services/index.ts";
import { openDatabase } from "../../src/storage/db.ts";
import { createStores } from "../../src/storage/stores.ts";
import { weekdayOf } from "../../src/time.ts";
import { grade, type Scenario, type Transcript, table } from "./grade.ts";
import { BASE_WEEK, coreScenarioIds, NOW, scenarios } from "./scenarios.ts";

/** shortcut: stands in for `@talaria/coach` until the server wires it; refuses runs on a no-run day, like H3. */
const evalCoach: CoachPort = {
  ...passThroughCoach,
  moveSession(st, id, slot, now) {
    if (st.settings.noRunDays.includes(weekdayOf(slot.start.slice(0, 10))))
      return { state: st, changes: [], warnings: [], refusal: "Ce jour est un jour sans course dans tes réglages." };
    return passThroughCoach.moveSession(st, id, slot, now);
  },
};

async function play(scenario: Scenario, reggie: ReggieRun): Promise<Transcript> {
  const calls: Transcript["calls"] = [];
  async function* recording(input: Parameters<ReggieRun>[0]) {
    for await (const event of reggie(input)) {
      if (event.type === "tool_call") calls.push({ name: event.name, input: event.input });
      yield event;
    }
  }

  const db = openDatabase(":memory:");
  const stores = createStores(db);
  for (const s of scenario.seed?.sessions ?? BASE_WEEK) stores.plannedSession.put(s);
  const services = createServices({
    db,
    clock: () => NOW,
    coach: evalCoach,
    fetchIcs: async () => "",
    reggie: recording,
  });
  if (scenario.seed?.profile) services.plan.updateProfile(scenario.seed.profile);
  if (scenario.seed?.health) stores.health.put({ id: "current", value: scenario.seed.health });
  for (const [i, m] of (scenario.history ?? []).entries())
    stores.chatMessage.put({ id: `h${i}`, at: `2026-11-16T06:5${i}:00.000Z`, role: m.role, text: m.text, widgets: [] });

  let text = "";
  let widgets: ChatWidget[] = [];
  let error: string | undefined;
  for await (const event of services.chat.send({ text: scenario.message, context: scenario.context })) {
    if (event.type === "done") ({ text, widgets } = event.message);
    if (event.type === "error") error = event.error;
  }
  return { calls, text, widgets, error };
}

const only = process.argv.length > 2 ? process.argv.slice(2) : coreScenarioIds;
const selected = only.length > 0 ? scenarios.filter((s) => only.includes(s.id)) : scenarios;
const reggie = createReggie(query);
const rows = [];
for (const scenario of selected) {
  const transcript = await play(scenario, reggie);
  rows.push({ scenario, grade: grade(scenario, transcript), calls: transcript.calls.map((c) => c.name) });
  console.info(`${scenario.id} : ${transcript.error ?? transcript.text.replaceAll("\n", " ")}`);
}
console.info(`\nModèle : ${process.env.REGGIE_MODEL || "sonnet"}\n\n${table(rows)}`);
process.exitCode = rows.every((r) => r.grade.pass) ? 0 : 1;
