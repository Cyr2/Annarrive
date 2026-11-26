/**
 * Runs every scenario (or only the ids given) against the real model (REGGIE_MODEL, default sonnet) and prints a
 * pass/fail table, with each reply's first-word and total time. Spends the account's quota: run it on purpose, never in CI.
 *   pnpm --filter @annarrive/server eval:reggie [--only id,id...]
 */

import type { ChatWidget } from "@annarrive/protocol";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { coachAdapter } from "../../src/coach-adapter.ts";
import { createReggie, type ReggieRun } from "../../src/reggie/agent.ts";
import { createServices } from "../../src/services/index.ts";
import { openDatabase } from "../../src/storage/db.ts";
import { createStores } from "../../src/storage/stores.ts";
import { grade, type Scenario, type Transcript, table } from "./grade.ts";
import { BASE_WEEK, FITNESS, NOW, PROGRAM, scenarios } from "./scenarios.ts";

/** All scenarios, or those of `--only a,b`; an unknown id stops the run instead of quietly running fewer. */
export function pick(all: Scenario[], args: string[]): Scenario[] {
  const at = args.indexOf("--only");
  if (at === -1) return all;
  const ids = (args[at + 1] ?? "").split(",").filter(Boolean);
  const unknown = ids.filter((id) => !all.some((s) => s.id === id));
  if (ids.length === 0 || unknown.length > 0) throw new Error(`--only : scénario inconnu ${unknown.join(", ")}`);
  return all.filter((s) => ids.includes(s.id));
}

/** Milliseconds from the message to Reggie's first word on screen, and to his whole reply. */
export type Timing = { firstTextMs: number | null; totalMs: number };

export async function play(scenario: Scenario, reggie: ReggieRun): Promise<Transcript & { timing: Timing }> {
  const calls: Transcript["calls"] = [];
  async function* recording(input: Parameters<ReggieRun>[0]) {
    for await (const event of reggie(input)) {
      if (event.type === "tool_call") calls.push({ name: event.name, input: event.input });
      yield event;
    }
  }
  const services = seeded(scenario, recording);
  let text = "";
  let widgets: ChatWidget[] = [];
  let error: string | undefined;
  const start = performance.now();
  let firstTextMs: number | null = null;
  for await (const event of services.chat.send({ text: scenario.message, context: scenario.context })) {
    if (event.type === "text") firstTextMs ??= Math.round(performance.now() - start);
    if (event.type === "done") ({ text, widgets } = event.message);
    if (event.type === "error") error = event.error;
  }
  return { calls, text, widgets, error, timing: { firstTextMs, totalMs: Math.round(performance.now() - start) } };
}

/** The scenario's world: this week, her semi, her level, and what the scenario adds. */
export function seeded(scenario: Pick<Scenario, "seed" | "history">, reggie: ReggieRun) {
  const db = openDatabase(":memory:");
  const stores = createStores(db);
  for (const s of scenario.seed?.sessions ?? BASE_WEEK) stores.plannedSession.put(s);
  stores.program.put({ id: "current", value: PROGRAM });
  stores.fitnessEstimate.put(FITNESS);
  const services = createServices({
    db,
    clock: () => NOW,
    publicUrl: "http://localhost",
    coach: coachAdapter,
    fetchIcs: async () => "",
    reggie,
  });
  if (scenario.seed?.profile) services.plan.updateProfile(scenario.seed.profile);
  if (scenario.seed?.health) stores.health.put({ id: "current", value: scenario.seed.health });
  for (const e of scenario.seed?.events ?? []) stores.calendarEvent.put(e);
  for (const a of scenario.seed?.activities ?? []) stores.activity.put(a);
  for (const [i, m] of (scenario.history ?? []).entries())
    stores.chatMessage.put({ id: `h${i}`, at: `2026-11-16T06:5${i}:00.000Z`, role: m.role, text: m.text, widgets: [] });
  return services;
}

if (import.meta.main) {
  const selected = pick(scenarios, process.argv.slice(2));
  const reggie = createReggie(query);
  const rows = [];
  for (const scenario of selected) {
    const transcript = await play(scenario, reggie);
    const { firstTextMs, totalMs } = transcript.timing;
    rows.push({ scenario, grade: grade(scenario, transcript), calls: transcript.calls.map((c) => c.name) });
    console.info(
      `${scenario.id} (${firstTextMs ?? "-"} / ${totalMs} ms) : ${transcript.error ?? transcript.text.replaceAll("\n", " ")}`,
    );
  }
  console.info(`\nModèle : ${process.env.REGGIE_MODEL || "sonnet"}\n\n${table(rows)}`);
  process.exitCode = rows.every((r) => r.grade.pass) ? 0 : 1;
}
