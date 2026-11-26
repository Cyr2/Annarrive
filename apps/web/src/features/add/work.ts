import type { NewEvent } from "../../api/client.ts";
import { addDays, mondayOf } from "../../lib/date.ts";
import { isValidSpan } from "./add.ts";

export type WorkRepeat = "weekly" | "weeks" | "once";

export const WORK_REPEATS: { value: WorkRepeat; label: string }[] = [
  { value: "weekly", label: "Chaque semaine" },
  { value: "weeks", label: "Certaines semaines" },
  { value: "once", label: "Une seule fois" },
];

/** How many weeks « Certaines semaines » lists, this one first. */
export const WEEKS_AHEAD = 12;

/**
 * Her work as a rule (design semaine-v2, variant 1): the days, the hours, how it repeats, and whether she stays on her
 * feet. `weeks` holds the Mondays she picked for « Certaines semaines »; an empty `until` repeats with no end.
 */
export type WorkForm = {
  title: string;
  days: number[];
  start: string;
  end: string;
  repeat: WorkRepeat;
  until: string;
  weeks: string[];
  legs: boolean;
};

export const upcomingMondays = (today: string): string[] =>
  Array.from({ length: WEEKS_AHEAD }, (_, i) => addDays(mondayOf(today), 7 * i));

/**
 * One event per day she works, all added as one change. A day already gone this week starts the rule the next
 * week; « Certaines semaines » is a weekly event that skips the weeks she left out.
 */
export function workEvents(form: WorkForm, from: string, today: string): NewEvent[] {
  const mondays = form.repeat === "weeks" ? [...form.weeks].sort() : [mondayOf(from)];
  return form.days.flatMap((day): NewEvent[] => {
    const dates = mondays.map((monday) => addDays(monday, day)).filter((date) => date >= today);
    if (form.repeat !== "weeks" && dates.length === 0) dates.push(addDays(mondayOf(from), day + 7));
    const first = dates[0];
    const last = dates.at(-1);
    if (!first || !last) return [];
    const event: NewEvent = {
      kind: "work",
      title: form.title.trim() || "Travail",
      date: first,
      start: form.start,
      end: form.end,
      legs: form.legs,
      repeat: form.repeat === "once" ? "never" : "weekly",
    };
    if (form.repeat === "weekly") return [{ ...event, until: form.until || undefined }];
    if (form.repeat === "once") return [event];
    const skipped = weeklyDates(first, last).filter((date) => !dates.includes(date));
    return [{ ...event, until: last, exceptions: skipped }];
  });
}

const weeklyDates = (first: string, last: string): string[] => {
  const dates: string[] = [];
  for (let date = first; date <= last; date = addDays(date, 7)) dates.push(date);
  return dates;
};

/** Whether « Ajouter le travail » can be pressed. */
export function isValidWork(form: WorkForm, from: string, today: string): boolean {
  if (!isValidSpan(form.start, form.end)) return false;
  const events = workEvents(form, from, today);
  // A « Jusqu'au » before her first day would add nothing.
  return events.length > 0 && events.every((e) => !e.until || e.until >= e.date);
}
