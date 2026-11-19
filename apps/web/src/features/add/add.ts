import type { NewEvent } from "../../api/client.ts";
import type { Repeat, Strength } from "../../api/schemas.ts";
import { addDays, addMinutes, minutesOf, weekdayName } from "../../lib/date.ts";

/** An event's title, as long as the server takes it (protocol, eventFields). */
export const TITLE_MAX = 80;

export const REPEATS: { value: Repeat; label: string }[] = [
  { value: "never", label: "Jamais" },
  { value: "weekly", label: "Chaque semaine" },
  { value: "biweekly", label: "Toutes les deux semaines" },
];

export const repeatLabel = (repeat: Repeat) => REPEATS.find((r) => r.value === repeat)?.label ?? "";

/** "Lundi 20:00 · chaque semaine", or "Pas placée cette semaine". */
export function strengthWhen(template: Strength): string {
  if (!template.placed) return "Pas placée cette semaine";
  const when = `${weekdayName(template.weekday)} ${template.start}`;
  return template.repeat === "never" ? when : `${when} · ${repeatLabel(template.repeat).toLowerCase()}`;
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
  return { kind: "busy", title: form.title.trim() || "Occupée", date: form.date, start: form.start, end: form.end };
}

/** Whether "Ajouter" can be pressed: a day, and a time (a révision) or a span that ends after it starts. */
export function isValidForm(kind: "revision" | "busy", form: Form): boolean {
  // A revision of 0 min, or one that runs past midnight, has no span.
  const end = kind === "revision" ? addMinutes(form.start, form.minutes) : form.end;
  return Boolean(form.date) && isValidSpan(form.start, end);
}

export function isValidSpan(start: string, end: string): boolean {
  return Boolean(start && end) && minutesOf(start) < minutesOf(end);
}
