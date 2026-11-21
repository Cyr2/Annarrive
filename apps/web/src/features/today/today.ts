import { type Item, isRepeat, type Run, type StepLine, type WatchStatus } from "../../api/schemas.ts";
import {
  addMinutes,
  daysBetween,
  decimal,
  minutesOf,
  monthName,
  relativeDay,
  relativeMoment,
  span,
} from "../../lib/date.ts";
import { classRow, type Ue } from "../../lib/text.ts";
import type { Tone } from "../../ui/tones.ts";
import type { SheetSpec } from "../sheets/store.ts";

export function toneOf(item: Item): Tone {
  return item.kind === "run" ? item.intensity : item.kind;
}

/** The name she reads: a class's course name, its UE as a pill and its other codes underneath (lib/text.ts). */
export function nameOf(item: Item): { title: string; detail?: string; ue?: Ue } {
  return item.kind === "class" ? classRow(item.title) : { title: item.title };
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
export function restLine(date: string, first = false): string {
  if (first) return "Rien à courir aujourd'hui. Ton plan commence avec la séance juste en dessous.";
  return REST_LINES[Number(date.slice(8)) % REST_LINES.length] ?? "";
}

/** The plan's first week with no run before today: she has not trained with it yet. */
export function beforeFirstRun(week: { index?: number | undefined; items: Item[] }, today: string): boolean {
  return week.index === 1 && !week.items.some((item) => item.kind === "run" && item.date < today);
}

/** Changes when what the card shows changes, so the card can turn over to its new content. */
export function contentKey(run: Run): string {
  return [run.id, run.title, run.durationMin, run.mainSet, run.pace, run.date, run.start].join("|");
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A race time to the second: "1:47:32", "24:05". */
export function raceClock(minutes: number): string {
  const total = Math.round(minutes * 60);
  const [h, m, s] = [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60];
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A gap in time: "28 s", "1 min 10", "4 min". */
function gapAmount(minutes: number): string {
  const total = Math.round(Math.abs(minutes) * 60);
  if (total < 60) return `${total} s`;
  const s = total % 60;
  return `${Math.floor(total / 60)} min${s ? ` ${pad(s)}` : ""}`;
}

/** The result against her target: the exact figure either way, never an alarm (algo.md RR2). */
export function targetGap(gapMin: number): { text: string; under: boolean } {
  if (Math.round(Math.abs(gapMin) * 60) === 0) return { text: "Pile ton objectif", under: true };
  return gapMin < 0
    ? { text: `${gapAmount(gapMin)} sous ton objectif`, under: true }
    : { text: `${gapAmount(gapMin)} au-dessus de ton objectif`, under: false };
}

/** Against her last race at the distance (RR3): « 4 min 28 de mieux qu'en décembre ». */
export function sinceLast(timeMin: number, previous: { timeMin: number; date?: string }, raceDate: string): string {
  const { date } = previous;
  const old = date !== undefined && daysBetween(date, raceDate) > 300;
  const when = date ? `qu'en ${monthName(date)}${old ? ` ${date.slice(0, 4)}` : ""}` : "que ton dernier chrono";
  const gain = previous.timeMin - timeMin;
  if (Math.round(Math.abs(gain) * 60) === 0) return `Le même temps ${when}`;
  return `${gapAmount(gain)} ${gain > 0 ? "de mieux" : "de plus"} ${when}`;
}

/** 306 s/km → "5'06 /km", the runner's notation. */
export function paceText(secondsPerKm: number): string {
  const total = Math.round(secondsPerKm);
  return `${Math.floor(total / 60)}'${pad(total % 60)}\u00a0/km`;
}

/** Under each bar of the splits: "5 km", then the kilometre it ends at, "Fin" for the last. */
export function splitLabel(toKm: number, index: number, count: number): string {
  if (index === count - 1) return "Fin";
  return index === 0 ? `${decimal(toKm)} km` : decimal(toKm);
}

/** What a tap on an item opens: the session detail, the strength sheet, or the event card. */
export function sheetFor(item: Item): SheetSpec {
  if (item.kind === "run") return { kind: "session", id: item.id };
  if (item.kind === "strength") return { kind: "strength", templateId: item.templateId };
  return { kind: "event", id: item.id };
}
