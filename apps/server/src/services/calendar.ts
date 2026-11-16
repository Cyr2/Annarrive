import type { CalendarEvent, DeleteEventQuery } from "@talaria/protocol";
import { addDays, dateOf, daysBetween } from "../time.ts";

const stepDays = { weekly: 7, biweekly: 14 } as const;

/** The occurrences of an event that intersect the days [from, to). */
export function occurrences(event: CalendarEvent, from: string, to: string): CalendarEvent[] {
  const intersects = (e: CalendarEvent) => e.start < `${to}T00:00` && e.end > `${from}T00:00`;
  if (event.recurrence === "none") return intersects(event) ? [event] : [];

  const first = dateOf(event.start);
  const length = daysBetween(first, dateOf(event.end));
  const found: CalendarEvent[] = [];
  for (
    let day = first;
    day < to && (!event.until || day <= event.until);
    day = addDays(day, stepDays[event.recurrence])
  ) {
    const occurrence = {
      ...event,
      start: `${day}${event.start.slice(10)}`,
      end: `${addDays(day, length)}${event.end.slice(10)}`,
    };
    if (!event.exceptions.includes(day) && intersects(occurrence)) found.push(occurrence);
  }
  return found;
}

/** The event left after a delete with this scope, or null when nothing of it remains. */
export function afterDelete(event: CalendarEvent, query: DeleteEventQuery): CalendarEvent | null {
  if (query.scope === "all" || event.recurrence === "none") return null;
  if (query.scope === "occurrence") return { ...event, exceptions: [...event.exceptions, query.date] };
  if (query.date <= dateOf(event.start)) return null;
  return { ...event, until: addDays(query.date, -1) };
}
