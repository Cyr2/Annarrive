import { icsUrlSchema } from "@annarrive/protocol";
import type { Program, Settings } from "../../api/schemas.ts";
import { daysBetween, longDate, weekdayName } from "../../lib/date.ts";
import type { SettingKey } from "../sheets/store.ts";

export const SETTING_LABELS: Record<SettingKey, string> = {
  runsPerWeek: "Courses par semaine",
  noRunDays: "Jours sans course",
  notBefore: "Pas avant",
  notAfter: "Pas après",
  bedtime: "Heure de coucher",
};

export function settingValue(key: SettingKey, settings: Settings): string {
  if (key === "runsPerWeek") return String(settings.runsPerWeek);
  if (key === "noRunDays") {
    // Three days or more fit the row only shortened ("Lun, Mer, Sam"), even at 320 px.
    const names = settings.noRunDays.map((d) => weekdayName(d).slice(0, settings.noRunDays.length > 2 ? 3 : undefined));
    return names.length ? names.join(", ") : "Aucun";
  }
  return settings[key];
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

/** Days to the race, as the card's big figure. */
export function countdown(date: string, today: string): { value: string; unit?: string } {
  const days = daysBetween(today, date);
  if (days <= 0) return { value: "Jour J" };
  return { value: String(days), unit: days > 1 ? "jours" : "jour" };
}

/** What each phase is for, in her words. A phase the app does not know keeps only its name. */
export const PHASE_TEXT: Record<string, string> = {
  Base: "Courir souvent et facile, pour construire ton endurance.",
  Développement: "Le rythme monte, avec des séances plus soutenues.",
  Spécifique: "Des séances à l'allure de ta course.",
  Affûtage: "Moins de volume, pour arriver fraîche le jour J.",
};

/** The watch's link, in Programme and its sheet; unknown when the server could not reach it. */
export function watchState(connected: boolean | undefined): string {
  if (connected === undefined) return "État inconnu";
  return connected ? "Connectée" : "Déconnectée";
}
