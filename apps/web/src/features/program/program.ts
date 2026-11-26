import { icsUrlSchema } from "@annarrive/protocol";
import type { Program, Settings } from "../../api/schemas.ts";
import { addDays, daysBetween, decimal, duration, longDate, minutesOf, weekdayName } from "../../lib/date.ts";
import type { SettingKey } from "../sheets/store.ts";

export const SETTING_LABELS: Record<SettingKey, string> = {
  runsPerWeek: "Courses par semaine",
  noRunDays: "Jours sans course",
  longRunDays: "Sortie longue",
  notBefore: "Pas avant",
  notAfter: "Pas après",
  bedtime: "Heure de coucher",
  preferredHour: "Heure préférée",
  travelMin: "Après une course, avant un cours",
};

export function settingValue(key: SettingKey, settings: Settings): string {
  if (key === "runsPerWeek") return String(settings.runsPerWeek);
  if (key === "noRunDays" || key === "longRunDays") {
    // Three days or more fit the row only shortened ("Lun, Mer, Sam"), even at 320 px.
    const days = settings[key];
    const names = days.map((d) => weekdayName(d).slice(0, days.length > 2 ? 3 : undefined));
    return names.length ? names.join(", ") : "Aucun";
  }
  // Never "0" on one line and "min" on the next.
  if (key === "travelMin") return duration(settings.travelMin).replaceAll(" ", " ");
  if (key === "preferredHour") {
    if (settings.preferredHour) return settings.preferredHour;
    return settings.usualHour ? `Automatique · vers ${settings.usualHour}` : "Automatique";
  }
  // « Pas après 0:00 » is midnight, the end of the day (algo.md H2).
  if (key === "notAfter" && minutesOf(settings.notAfter) === 0) return "Minuit";
  return settings[key];
}

/** « Ta dernière course »: how long ago, in months, as she answers it. */
export const RACE_AGO = [
  { value: "0", label: "moins d'un mois" },
  ...[1, 2, 3, 4, 5, 6].map((m) => ({ value: String(m), label: `${m} mois` })),
  { value: "7", label: "plus de 6 mois" },
];
const MONTH_DAYS = 30.44;

/** Back from a stored date to the answer she gave; a time stored without a date reads as recent. */
export const raceAgoOf = (date: string | undefined, today: string): string =>
  date ? String(Math.min(7, Math.round(daysBetween(date, today) / MONTH_DAYS))) : "0";

/** The date to store for her answer: mid-month for « moins d'un mois », nine months for « plus de 6 mois ». */
export const raceDateOf = (ago: string, today: string): string => {
  const months = Number(ago);
  return addDays(today, -Math.round((months === 0 ? 0.5 : months === 7 ? 9 : months) * MONTH_DAYS));
};

export const RACE_DISTANCES = [
  { value: 5000, label: "5 km" },
  { value: 10000, label: "10 km" },
  { value: 21097.5, label: "Semi" },
  { value: 42195, label: "Marathon" },
];

/** A race time as she says it: "1:52" to the minute past an hour, "24:30" under it, seconds when she gave some. */
export const raceClock = (seconds: number): string =>
  seconds >= 3600 && seconds % 60 === 0 ? clock(seconds).slice(0, -3) : clock(seconds);

/** "Semi en 1:52, il y a 2 mois": her last race on one line. */
export function lastRaceLine(last: NonNullable<Program["lastTime"]>, today: string): string {
  const time = raceClock(Math.round(last.minutes * 60));
  const name = RACE_DISTANCES.find((d) => d.value === last.distanceM)?.label ?? `${decimal(last.distanceM / 1000)} km`;
  const ago = RACE_AGO.find((a) => a.value === raceAgoOf(last.date, today))?.label ?? "";
  return `${name} en ${time}, ${last.date ? `il y a ${ago}` : "estimé"}`;
}

/** "Dimanche 17 janvier · J-62" */
export function raceLine(program: Program, today: string): string {
  const date = longDate(program.goal.date);
  return `${date.charAt(0).toUpperCase()}${date.slice(1)} · J-${daysBetween(today, program.goal.date)}`;
}

/** Each phase with its share of the plan and whether the current week is in it. */
export function phaseBar(program: Program) {
  let start = 1;
  return program.phases.map((phase) => {
    const current = program.weekIndex >= start && program.weekIndex < start + phase.weeks;
    start += phase.weeks;
    return { ...phase, current };
  });
}

/** A pasted timetable link, or why it cannot be used. Calendar apps share `webcal:` links: the same feed over https. */
export function checkIcsUrl(text: string): { url?: string; error?: string } {
  const url = text.trim().replace(/^webcal:/i, "https:");
  if (!url) return { error: "Colle le lien de ton emploi du temps." };
  const parsed = icsUrlSchema.safeParse(url);
  return parsed.success ? { url: parsed.data } : { error: parsed.error.issues[0]?.message };
}

/** Her own target, tagged without ever discouraging (the app does not propose a time). */
export const TARGET_TAG = { reachable: "Atteignable", ambitious: "Ambitieux" } as const;

/** A duration in seconds as a race clock: "1:48:00", or "24:30" under an hour. */
export function clock(seconds: number): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = Math.floor(seconds / 3600);
  const rest = `${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`;
  return h ? `${h}:${rest}` : rest.replace(/^0/, "");
}

/** "1:48:00" or "1:48" (hours and minutes, as the server writes it) to seconds; 0 when empty. */
export function secondsOf(targetTime: string | undefined): number {
  const parts = targetTime?.split(":").map(Number) ?? [];
  if (parts.some(Number.isNaN)) return 0;
  const [h = 0, m = 0, s = 0] = parts.length === 2 ? [...parts, 0] : parts;
  return h * 3600 + m * 60 + s;
}

/** The watch's link, in Programme and its sheet; unknown when the server could not reach it. */
export function watchState(connected: boolean | undefined): string {
  if (connected === undefined) return "État inconnu";
  return connected ? "Connectée" : "Déconnectée";
}
