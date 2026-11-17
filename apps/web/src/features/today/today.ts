import type { Item, Run, WatchStatus, Week } from "../../api/schemas.ts";
import { addDays, addMinutes, dayName, minutesOf, relativeMoment, span } from "../../lib/date.ts";
import type { Tone } from "../../ui/tones.ts";
import type { SheetSpec } from "../sheets/store.ts";

export function toneOf(item: Item): Tone {
  return item.kind === "run" ? item.intensity : item.kind;
}

const DOT_ORDER: Tone[] = ["hard", "long", "easy", "revision", "strength", "class"];

/** The seven days of "Cette semaine": letter, number, and one dot per kind of thing planned. */
export function weekStrip(week: Week, today: string) {
  return Array.from({ length: 7 }, (_, i) => {
    const date = addDays(week.monday, i);
    const kinds = new Set(
      week.items
        .filter((item) => item.date === date && !("cancelled" in item && item.cancelled))
        .map((item): Tone => (item.kind === "run" ? item.intensity : item.kind === "busy" ? "class" : item.kind)),
    );
    return {
      date,
      letter: dayName(date).charAt(0),
      day: dayName(date),
      number: Number(date.slice(8)),
      today: date === today,
      dots: DOT_ORDER.filter((tone) => kinds.has(tone)),
    };
  });
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

/** The context chip Reggie opens with: "Fractionné, ce soir 18:00". */
export function sessionContext(run: Run, today: string): string {
  return `${run.title}, ${relativeMoment(run.date, run.start, today).replace(/^\S/, (c) => c.toLowerCase())}`;
}

export const WATCH_LABEL: Record<WatchStatus, string> = {
  synced: "Sur ta montre",
  sending: "Envoi à ta montre…",
  failed: "Pas envoyée, réessayer",
};

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
