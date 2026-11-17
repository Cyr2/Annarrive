import type { CalendarEvent, Item, MoveOptions, Run, Slot, Week } from "../../api/schemas.ts";
import { addDays, addMinutes, dayTitle, duration, minutesOf, span, weekRange } from "../../lib/date.ts";
import { agenda } from "../today/today.ts";

/** A row of a day: one item, or her classes folded into one line when they crowd the day. */
export type Row = { kind: "item"; item: Item } | { kind: "classes"; items: CalendarEvent[] };

export type Day = {
  date: string;
  title: string;
  /** "Aujourd'hui", "Pas de course", "Rien de prévu", or nothing. */
  note: string;
  today: boolean;
  past: boolean;
  /** Minutes of running planned that day. */
  runMinutes: number;
  items: Item[];
  rows: Row[];
};

const isRun = (item: Item): item is Run => item.kind === "run";
const cancelled = (item: Item) => "cancelled" in item && Boolean(item.cancelled);

/** Past this many classes in a day, they fold into one line: the runs stay the subject of the day. */
export const FOLD_CLASSES = 3;

/** Her classes in one row at the place of the first one, once there are more than FOLD_CLASSES. */
export function rowsOf(items: Item[]): Row[] {
  const classes = items.filter((item): item is CalendarEvent => item.kind === "class");
  if (classes.length <= FOLD_CLASSES) return items.map((item) => ({ kind: "item", item }));
  return items.flatMap((item): Row[] => {
    if (item.kind !== "class") return [{ kind: "item", item }];
    return item === classes[0] ? [{ kind: "classes", items: classes }] : [];
  });
}

function noteOf(date: string, today: string, items: Item[]): string {
  if (date === today) return "Aujourd'hui";
  if (items.length === 0) return "Rien de prévu";
  return items.some(isRun) ? "" : "Pas de course";
}

/** The seven days of the week, empty ones included, each with its note and its running load. */
export function weekDays(week: Week, today: string): Day[] {
  return Array.from({ length: 7 }, (_, i) => addDays(week.monday, i)).map((date) => {
    const items = agenda(week.items, date);
    const runMinutes = items.filter(isRun).reduce((sum, run) => sum + run.durationMin, 0);
    return {
      date,
      title: dayTitle(date),
      note: noteOf(date, today, items),
      today: date === today,
      past: date < today,
      runMinutes,
      items,
      rows: rowsOf(items),
    };
  });
}

/** "Mercredi 18 : 1 course, 1 révision", what VoiceOver reads on a day of the strip. */
export function dayLabel(day: Day): string {
  const count = (kind: Item["kind"], one: string, many: string) => {
    const n = day.items.filter((item) => item.kind === kind && !cancelled(item)).length;
    return n === 0 ? [] : [`${n} ${n > 1 ? many : one}`];
  };
  const parts = [
    ...count("run", "course", "courses"),
    ...count("strength", "muscu", "muscu"),
    ...count("revision", "révision", "révisions"),
    ...count("class", "cours", "cours"),
  ];
  return `${day.title} : ${parts.length ? parts.join(", ") : "rien de prévu"}`;
}

// Each part stays on one line: "4 h 30" never splits after the 4.
const keep = (text: string) => text.replaceAll(" ", " ");

/**
 * The week's heading: its range, and what is left to run ("Il reste 3 courses sur 4, 2 h 45").
 * A past or future week counts all its runs.
 */
export function weekHeading(week: Week, today: string) {
  const runs = week.items.filter(isRun);
  const left = runs.filter((run) => run.date >= today);
  const minutes = (list: Run[]) => duration(list.reduce((sum, run) => sum + run.durationMin, 0));
  const plural = (n: number) => `${n} ${n > 1 ? "courses" : "course"}`;
  const ongoing = left.length > 0 && left.length < runs.length;
  const load =
    runs.length === 0
      ? "Aucune course"
      : ongoing
        ? `Il reste ${left.length} sur ${plural(runs.length)}`
        : plural(runs.length);
  const time = runs.length === 0 ? undefined : minutes(ongoing ? left : runs);
  return {
    range: weekRange(week.monday),
    load: keep(load),
    time: time && keep(time),
    position: week.index && week.total ? keep(`Semaine ${week.index} sur ${week.total}`) : undefined,
  };
}

/** Folded classes: "8:00 à 18:50". */
export function classesSpan(items: CalendarEvent[]): string {
  const first = items[0];
  const last = items.at(-1);
  return first && last ? span(first.start, last.end) : "";
}

/** Sessions, strength and revision move by drag. Classes are locked, past weeks are read-only. */
export function isDraggable(item: Item, readOnly: boolean): boolean {
  return !readOnly && item.kind !== "class" && !cancelled(item);
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

/** Under "Emploi du temps" after a refresh: "Relu à l'instant : 1 cours annulé jeudi". */
export function refreshLine(summary: string | undefined): string {
  return summary ? `Relu à l'instant : ${summary}` : "Relu à l'instant, rien n'a changé";
}
