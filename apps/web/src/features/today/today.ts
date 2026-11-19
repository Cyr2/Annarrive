import { type Item, isRepeat, type Run, type StepLine, type WatchStatus } from "../../api/schemas.ts";
import { addMinutes, minutesOf, relativeDay, relativeMoment, span } from "../../lib/date.ts";
import { classTitle } from "../../lib/text.ts";
import type { Tone } from "../../ui/tones.ts";
import type { SheetSpec } from "../sheets/store.ts";

export function toneOf(item: Item): Tone {
  return item.kind === "run" ? item.intensity : item.kind;
}

/** The name she reads: a class's course name, its codes underneath (lib/text.ts); anything else as it is. */
export function nameOf(item: Item): { title: string; detail?: string } {
  return item.kind === "class" ? classTitle(item.title) : { title: item.title };
}

/** "Ma journée": the day's items in time order. */
export function agenda(items: Item[], date: string) {
  return items.filter((item) => item.date === date).sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
}

export function itemTime(item: Item): string {
  return item.kind === "run" ? span(item.start, endOf(item)) : span(item.start, item.end);
}

export function endOf(run: Run): string {
  return addMinutes(run.start, run.durationMin);
}

const GOAL_WORDS: Record<string, string> = {
  "Semi-marathon": "mon semi",
  Marathon: "mon marathon",
  "10 km": "mon 10 km",
  "5 km": "mon 5 km",
};

/** « En parler avec Reggie » under « Pourquoi cette séance »: « Pourquoi cette séance de Seuil aujourd'hui ? … ». */
export function whyQuestion(run: Run, today: string, goal?: string): string {
  const day = relativeDay(run.date, today).replace(/^\S/, (c) => c.toLowerCase());
  const target = goal && GOAL_WORDS[goal];
  return `Pourquoi cette séance de ${run.title} ${day} ? À quoi elle me sert${target ? ` pour ${target}` : ""} ?`;
}

/** What Reggie reads about the session: its moment, then each step as the watch has it. */
export function sessionDetail(run: Run, today: string): string {
  const line = (s: StepLine) => [s.label, s.pace].filter(Boolean).join(" à ");
  const steps = run.steps.map((s) =>
    isRepeat(s) ? `Répéter ${s.repeat} fois (${s.steps.map(line).join(", ")})` : line(s),
  );
  return [sessionContext(run, today), ...steps].join(" · ");
}

/** The context chip Reggie opens with: "Fractionné, ce soir 18:00". */
export function sessionContext(run: Run, today: string): string {
  return `${run.title}, ${relativeMoment(run.date, run.start, today).replace(/^\S/, (c) => c.toLowerCase())}`;
}

export const WATCH_LABEL: Record<WatchStatus, string> = {
  synced: "Sur ta montre",
  sending: "Envoi à ta montre…",
  failed: "Pas envoyée",
  off: "Montre pas reliée",
};

const REST_LINES = [
  "Tes jambes récupèrent aujourd'hui. C'est là qu'elles progressent.",
  "Le repos fait partie du plan. Profite de ta journée.",
  "Rien à courir. Ton corps assimile le travail des derniers jours.",
];

/** The rest day's sentence: one per date, so it stays the same all day and changes the next rest day. */
export function restLine(date: string): string {
  return REST_LINES[Number(date.slice(8)) % REST_LINES.length] ?? "";
}

/** Changes when what the card shows changes, so the card can turn over to its new content. */
export function contentKey(run: Run): string {
  return [run.id, run.title, run.durationMin, run.mainSet, run.pace, run.date, run.start].join("|");
}

/** What a tap on an item opens: the session detail, the strength sheet, or the event card. */
export function sheetFor(item: Item): SheetSpec {
  if (item.kind === "run") return { kind: "session", id: item.id };
  if (item.kind === "strength") return { kind: "strength", templateId: item.templateId };
  return { kind: "event", id: item.id };
}
