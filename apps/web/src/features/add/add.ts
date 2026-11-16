import type { NewEvent } from "../../api/client.ts";
import type { Repeat, Strength } from "../../api/schemas.ts";
import { addDays, addMinutes, minutesOf, weekdayName } from "../../lib/date.ts";

export const REPEATS: { value: Repeat; label: string }[] = [
  { value: "never", label: "Jamais" },
  { value: "weekly", label: "Chaque semaine" },
  { value: "biweekly", label: "Toutes les deux semaines" },
];

export const repeatLabel = (repeat: Repeat) => REPEATS.find((r) => r.value === repeat)?.label ?? "";

/** "Lundi 20:00 · chaque semaine", or "Pas placée cette semaine". */
export function strengthWhen(template: Strength): string {
  if (!template.placed) return "Pas placée cette semaine";
  return `${weekdayName(template.weekday)} ${template.start} · ${repeatLabel(template.repeat).toLowerCase()}`;
}

/** "Lundi 20:00", for the Programme list where the row is narrow. */
export function strengthShort(template: Strength): string {
  return template.placed ? `${weekdayName(template.weekday)} ${template.start}` : "Pas placée";
}

/** The date of a template's usual weekday in the week of `today`, never in the past. */
export function usualDate(template: Strength, monday: string, today: string): string {
  const date = addDays(monday, template.weekday);
  return date < today ? addDays(date, 7) : date;
}

export type Form = { title: string; date: string; start: string; end: string; minutes: number; repeat: Repeat };

export function strengthEvent(template: Strength, date: string, start: string): NewEvent {
  return {
    kind: "strength",
    title: template.name,
    legs: template.legs,
    date,
    start,
    end: addMinutes(start, template.durationMin),
  };
}

export function revisionEvent(form: Form): NewEvent {
  return {
    kind: "revision",
    title: "Révision",
    date: form.date,
    start: form.start,
    end: addMinutes(form.start, form.minutes),
    repeat: form.repeat,
  };
}

export function busyEvent(form: Form): NewEvent {
  return { kind: "busy", title: form.title.trim() || "Indispo", date: form.date, start: form.start, end: form.end };
}

export function isValidSpan(start: string, end: string): boolean {
  return Boolean(start && end) && minutesOf(start) < minutesOf(end);
}
