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
  if (key === "noRunDays") return settings.noRunDays.length ? settings.noRunDays.map(weekdayName).join(", ") : "Aucun";
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

/** Her own target, tagged without ever discouraging (the app does not propose a time). */
export const TARGET_TAG = { reachable: "Atteignable", ambitious: "Ambitieux" } as const;
