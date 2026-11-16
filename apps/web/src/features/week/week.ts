import type { Item, MoveOptions, Slot, Week } from "../../api/schemas.ts";
import { addDays, addMinutes, dayTitle, duration, minutesOf, weekRange } from "../../lib/date.ts";
import { agenda } from "../today/today.ts";

export type Day = { date: string; title: string; note: string; items: Item[] };

/** The days of the week that have something, each with its note ("Aujourd'hui", "Repos"). */
export function weekDays(week: Week, today: string): Day[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week.monday, i)).map((date) => {
    const items = agenda(week.items, date);
    const hasRun = items.some((item) => item.kind === "run");
    const note = date === today ? "Aujourd'hui" : hasRun ? "" : "Repos";
    return { date, title: dayTitle(date), note, items };
  });
}

/** "16 au 22 novembre" and "Semaine 4 sur 12 · 4 courses · 3 h 35". */
export function weekHeading(week: Week) {
  const runs = week.items.filter((item) => item.kind === "run");
  const minutes = runs.reduce((sum, run) => sum + (run.kind === "run" ? run.durationMin : 0), 0);
  const parts = [
    week.index && week.total ? `Semaine ${week.index} sur ${week.total}` : undefined,
    `${runs.length} ${runs.length > 1 ? "courses" : "course"}`,
    runs.length ? duration(minutes) : undefined,
  ];
  return { range: weekRange(week.monday), summary: parts.filter(Boolean).join(" · ") };
}

/** Sessions, strength and revision move by drag. Classes are locked, past weeks are read-only. */
export function isDraggable(item: Item, readOnly: boolean): boolean {
  return !readOnly && item.kind !== "class" && !("cancelled" in item && item.cancelled);
}

export type DropTarget = { date: string; start: string; blocked?: string };

/**
 * Where a dragged item may land, day by day: the server's move options for a run (blocked days with
 * their reason, proposed times), only "not in the past" for the rest.
 */
export function dropTargets(item: Item, week: Week, today: string, options?: MoveOptions): DropTarget[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week.monday, i))
    .filter((date) => date !== item.date)
    .map((date) => {
      const blocked = date < today ? "Ce jour est passé" : options?.blocked.find((b) => b.date === date)?.reason;
      const proposed = options?.slots.find((s) => s.date === date);
      return { date, start: proposed?.start ?? item.start, blocked };
    });
}

/**
 * The week with one item already at its new place, shown the instant it is dropped (the server answers after).
 * Keeps the item's length: an event's end moves with its start.
 */
export function moveItem(week: Week, id: string, slot: Slot): Week {
  return {
    ...week,
    items: week.items.map((item) => {
      if (item.id !== id) return item;
      if (item.kind === "run") return { ...item, ...slot };
      const length = minutesOf(item.end) - minutesOf(item.start);
      return { ...item, ...slot, end: addMinutes(slot.start, length) };
    }),
  };
}

/** Banner after a refresh: "Emploi du temps à jour · 1 cours annulé jeudi". */
export function refreshLine(summary: string | undefined): string {
  return summary ? `Emploi du temps relu · ${summary}` : "Emploi du temps relu, rien n'a changé";
}
