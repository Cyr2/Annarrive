/** Calendar helpers on local `YYYY-MM-DD` strings and `H:MM` times. French labels, no Intl, so tests are stable. */

const DAYS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function parts(iso: string): [number, number, number] {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  return [y, m, d];
}

export function toDate(iso: string): Date {
  const [y, m, d] = parts(iso);
  return new Date(y, m - 1, d);
}

export function toIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const date = toDate(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

/** 0 for Monday, 6 for Sunday. */
export function weekday(iso: string): number {
  return (toDate(iso).getDay() + 6) % 7;
}

export function mondayOf(iso: string): string {
  return addDays(iso, -weekday(iso));
}

/** ISO 8601 week of a date, "2026-W47": the week of its Thursday. */
export function isoWeek(iso: string): string {
  const thursday = addDays(iso, 3 - weekday(iso));
  const year = thursday.slice(0, 4);
  const week = Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toDate(to).getTime() - toDate(from).getTime()) / 86_400_000);
}

export function dayName(iso: string): string {
  return DAYS[weekday(iso)] ?? "";
}

export function weekdayName(index: number): string {
  return DAYS[index] ?? "";
}

/** "Lundi 16" */
export function dayTitle(iso: string): string {
  return `${dayName(iso)} ${parts(iso)[2]}`;
}

/** "dimanche 17 janvier" */
export function longDate(iso: string): string {
  const [, m, d] = parts(iso);
  return `${dayName(iso).toLowerCase()} ${d} ${MONTHS[m - 1]}`;
}

/** French abbreviations: "juin", "juil.", "sept.". */
const SHORT_MONTHS = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

/** "16 au 22 novembre", or "30 nov. au 6 déc." across two months: two full names would not fit at 320 px. */
export function weekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const [, m1, d1] = parts(monday);
  const [, m2, d2] = parts(sunday);
  return m1 === m2
    ? `${d1} au ${d2} ${MONTHS[m2 - 1]}`
    : `${d1} ${SHORT_MONTHS[m1 - 1]} au ${d2} ${SHORT_MONTHS[m2 - 1]}`;
}

/** How a day is named relative to today: "Aujourd'hui", "Demain", "Mercredi", "Lundi 23". */
export function relativeDay(iso: string, today: string): string {
  const gap = daysBetween(today, iso);
  if (gap === 0) return "Aujourd'hui";
  if (gap === 1) return "Demain";
  if (gap > 1 && gap < 7) return dayName(iso);
  return dayTitle(iso);
}

/** "Ce soir" from 17:00 today, "Aujourd'hui" before, then "Demain", "Mercredi". */
export function momentLabel(iso: string, time: string, today: string): string {
  if (iso === today) return minutesOf(time) >= 17 * 60 ? "Ce soir" : "Aujourd'hui";
  return relativeDay(iso, today);
}

/** "Ce soir 18:00", "Aujourd'hui 7:30", "Demain 7:30", "Mercredi 18:00". */
export function relativeMoment(iso: string, time: string, today: string): string {
  return `${momentLabel(iso, time, today)} ${time}`;
}

/** A moment that is over: never "Ce soir" ("Aujourd'hui 18:00", "Hier 7:30", "Lundi 18:00"). */
export function pastMoment(iso: string, time: string, today: string): string {
  const day = daysBetween(today, iso) === -1 ? "Hier" : relativeDay(iso, today);
  return `${day} ${time}`;
}

export function minutesOf(time: string): number {
  const [h = 0, m = 0] = time.split(":").map(Number);
  return h * 60 + m;
}

export function timeOf(minutes: number): string {
  const wrapped = ((minutes % 1440) + 1440) % 1440;
  return `${Math.floor(wrapped / 60)}:${String(wrapped % 60).padStart(2, "0")}`;
}

export function addMinutes(time: string, minutes: number): string {
  return timeOf(minutesOf(time) + minutes);
}

/** "50 min", "1 h", "1 h 20", "3 h 35". */
export function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

/** French decimal: "12,5". */
export function decimal(value: number): string {
  return String(value).replace(".", ",");
}

/** "10:15 à 12:15" */
export function span(start: string, end: string): string {
  return `${start} à ${end}`;
}

/** "il y a 12 min", "il y a 2 h", "à l'instant". */
export function ago(fromIsoDateTime: string, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(fromIsoDateTime).getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 48 * 60) return `il y a ${Math.floor(minutes / 60)} h`;
  return `il y a ${Math.floor(minutes / 1440)} jours`;
}
