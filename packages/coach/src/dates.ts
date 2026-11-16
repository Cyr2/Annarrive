/**
 * Local ISO dates handled as naive UTC minutes: the coach never needs a time zone,
 * only differences between wall-clock times.
 */
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/;
const MS_PER_MIN = 60_000;
export const DAY_MIN = 1440;

export function toMin(iso: string): number {
  const m = ISO.exec(iso);
  if (!m) throw new RangeError(`Invalid date: ${iso}`);
  const n = (i: number): number => Number(m[i] ?? 0);
  return Date.UTC(n(1), n(2) - 1, n(3), n(4), n(5)) / MS_PER_MIN;
}

export function toIso(min: number): string {
  return new Date(min * MS_PER_MIN).toISOString().slice(0, 16);
}

export const dateOf = (iso: string): string => iso.slice(0, 10);
export const addMin = (iso: string, min: number): string => toIso(toMin(iso) + min);
export const addDays = (date: string, days: number): string => dateOf(toIso(toMin(date) + days * DAY_MIN));
export const daysBetween = (a: string, b: string): number =>
  Math.round((toMin(dateOf(b)) - toMin(dateOf(a))) / DAY_MIN);
export const hoursBetween = (a: string, b: string): number => (toMin(b) - toMin(a)) / 60;

/** 0 = Monday to 6 = Sunday. */
export const weekday = (iso: string): number => (new Date(toMin(dateOf(iso)) * MS_PER_MIN).getUTCDay() + 6) % 7;
export const mondayOf = (iso: string): string => addDays(dateOf(iso), -weekday(iso));
/** The Monday strictly after `iso`. */
export const nextMonday = (iso: string): string => addDays(mondayOf(iso), 7);

/** "HH:mm" to minutes after midnight. */
export function clockMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export const at = (date: string, hhmm: string): string => toIso(toMin(date) + clockMin(hhmm));
export const weekDates = (monday: string): string[] => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
