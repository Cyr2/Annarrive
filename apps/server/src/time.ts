/** Every date the app shows or stores is Europe/Paris wall-clock time (algo.md section 0). */
export type Clock = () => Date;
export const systemClock: Clock = () => new Date();

const parisFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Paris",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "2026-11-16T18:00" in Paris time. */
export function toParisLocal(instant: Date): string {
  const parts = Object.fromEntries(parisFormat.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function dateOf(localDateTime: string): string {
  return localDateTime.slice(0, 10);
}

function utcDay(localDate: string): Date {
  return new Date(`${localDate}T00:00:00Z`);
}

export function addDays(localDate: string, days: number): string {
  const d = utcDay(localDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((utcDay(to).getTime() - utcDay(from).getTime()) / 86_400_000);
}

/** ISO weekday: Monday 1 to Sunday 7. */
export function weekdayOf(localDate: string): number {
  return utcDay(localDate).getUTCDay() || 7;
}

export function mondayOf(localDate: string): string {
  return addDays(localDate, 1 - weekdayOf(localDate));
}

/** Monday of an ISO week like "2026-W47" (week 1 holds January 4). */
export function isoWeekStart(isoWeek: string): string {
  const year = isoWeek.slice(0, 4);
  const week = Number(isoWeek.slice(6));
  return addDays(mondayOf(`${year}-01-04`), (week - 1) * 7);
}

export function isoWeekOf(localDate: string): string {
  const thursday = addDays(mondayOf(localDate), 3);
  const week = Math.floor(daysBetween(mondayOf(`${thursday.slice(0, 4)}-01-04`), thursday) / 7) + 1;
  return `${thursday.slice(0, 4)}-W${String(week).padStart(2, "0")}`;
}

/** Shifts a local date-time by whole minutes, ignoring DST (wall-clock arithmetic). */
export function addMinutes(localDateTime: string, minutes: number): string {
  const d = new Date(`${localDateTime}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 16);
}

const weekdays = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

export function frenchWeekday(localDate: string): string {
  return weekdays[weekdayOf(localDate) - 1] ?? "";
}

/** "18:00", "7:30": the clock as the app writes it, without a zero in front of the hour. */
export function frenchClock(localDateTime: string): string {
  return localDateTime.slice(11, 16).replace(/^0/, "");
}

/** "mercredi 18:00", "mardi 7:30" */
export function frenchMoment(localDateTime: string): string {
  return `${frenchWeekday(dateOf(localDateTime))} ${frenchClock(localDateTime)}`;
}
