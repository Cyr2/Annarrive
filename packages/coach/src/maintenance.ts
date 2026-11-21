import { type BuildCtx, buildSession } from "./catalog.ts";
import { dateOf, daysBetween, nextMonday } from "./dates.ts";
import type { Activity, Goal, Paces, RunType, Session, Settings } from "./types.ts";

const ROTATION: RunType[] = ["T", "I", "FARTLEK"];
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** MA1. */
export const maintenanceVolume = (history8w: number[]): number => Math.max(90, 0.5 * mean(history8w));

/**
 * MA1 to MA5: one Q rotating T → I → FARTLEK (weekIdx from 1), strides once, optional L ≤ min(75, 0.40 × V),
 * the rest in E. No deload week.
 */
export function maintenanceWeek(
  history8w: number[],
  settings: Settings,
  weekIdx: number,
  fitness: { paces: Paces },
  withLong = false,
): Session[] {
  const v = maintenanceVolume(history8w);
  const n = Math.max(2, Math.min(settings.runsPerWeek, 3));
  const ctx: BuildCtx = { weeklyMin: v, paces: fitness.paces, phase: "dev", progressionStep: 0, distM: 10000 };
  const qType = ROTATION[(weekIdx - 1) % ROTATION.length] ?? "T";
  const q = { ...buildSession(qType, { ...ctx, durMin: 40 }), id: `m${weekIdx}-q` };
  const long = withLong && n > 2 ? Math.floor(Math.min(75, 0.4 * v)) : 0;
  const easyCount = n - 1 - (long > 0 ? 1 : 0);
  const eMin = Math.max(20, Math.floor((v - q.durMin - long) / easyCount));
  const easy = [...Array(easyCount).keys()].map((i) => ({
    ...buildSession("E", { ...ctx, durMin: eMin, strides: i === 0 }),
    id: `m${weekIdx}-e${i}`,
  }));
  const l = long > 0 ? [{ ...buildSession("L", { ...ctx, durMin: long }), id: `m${weekIdx}-l` }] : [];
  return [q, ...easy, ...l];
}

type RecoveryWeek = { share: number; runs: number };
/**
 * P23, MA6 (research 06 §4): days without a run after the race, then each easy week's share of the usual volume
 * and number of runs, by race distance. Pfitzinger adds a week from 15 km; 3 runs in the 4 days left after a
 * marathon's 3 days off would touch (Sherman 1984).
 */
type Recovery = { restDays: number; weeks: RecoveryWeek[] };
const SHORT: Recovery = { restDays: 1, weeks: [{ share: 0.75, runs: 3 }] };
const HALF: Recovery = {
  restDays: 2,
  weeks: [
    { share: 0.5, runs: 3 },
    { share: 0.75, runs: 3 },
  ],
};
const FULL: Recovery = {
  restDays: 3,
  weeks: [
    { share: 0.35, runs: 2 },
    { share: 0.6, runs: 3 },
    { share: 0.8, runs: 3 },
  ],
};
const recoveryOf = (distM: number): Recovery => (distM < 15000 ? SHORT : distM < 30000 ? HALF : FULL);

/** MA6: number of easy weeks after a race of `distM`. */
export const recoveryWeeks = (distM: number): number => recoveryOf(distM).weeks.length;

/** MA6: days without a run right after a race of `distM`. */
export const recoveryRestDays = (distM: number): number => recoveryOf(distM).restDays;

const COUNT = ["une semaine", "deux semaines", "trois semaines"];
/** MA6, as the after-race screen and the banner say it: « deux semaines de footings faciles ». */
export const recoveryText = (distM: number): string =>
  `${COUNT[recoveryWeeks(distM) - 1] ?? "une semaine"} de footings faciles`;

/**
 * P23, MA6: week `week` (from 1) after a race of `distM`: easy runs only, its share of the usual volume, never shorter
 * than a 20 min footing; the last easy week brings strides back once (Pfitzinger).
 */
export function postRaceWeek(usualMin: number, paces: Paces, distM: number, week = 1): Session[] {
  const weeks = recoveryOf(distM).weeks;
  const { share, runs } = weeks[week - 1] ?? { share: 1, runs: 3 };
  const each = Math.max(20, Math.floor((share * usualMin) / runs));
  const ctx: BuildCtx = { weeklyMin: usualMin, paces, phase: "base", progressionStep: 0, distM: 10000, durMin: each };
  const strides = week === weeks.length;
  return [...Array(runs).keys()].map((i) => ({
    ...buildSession("E", { ...ctx, strides: strides && i === 0 }),
    id: `post-race-${week}-${i}`,
  }));
}

export type LastRace = { day: string; distM: number };

/**
 * MA6: the last race before `monday`: the goal once its date is past, else the last run marked as the goal race
 * (« Garder la forme » clears the goal, a new goal replaces it, neither clears the easy weeks).
 */
export function lastRace(goal: Goal, history: Activity[], monday: string): LastRace | undefined {
  if (goal && goal.date < monday) return { day: goal.date, distM: goal.distanceM };
  const run = history
    .filter((a) => a.isRace && dateOf(a.start) < monday)
    .sort((a, b) => a.start.localeCompare(b.start))
    .at(-1);
  return run && { day: dateOf(run.start), distM: run.distM };
}

/** MA6: which easy week after `race` starts on `monday` (from 1), or null outside them. */
export function postRaceIndex(race: LastRace, monday: string): number | null {
  const days = daysBetween(race.day, monday);
  return days <= 0 || days > 7 * recoveryWeeks(race.distM) ? null : Math.ceil(days / 7);
}

/** MA7: V0 = mean of the maintenance weeks, plan from next Monday. */
export const exitMaintenance = (history4w: number[], now: string): { v0: number; planStart: string } => ({
  v0: mean(history4w),
  planStart: nextMonday(now),
});

/** MA8: stopping the programme switches to maintenance next Monday; the current week stays. */
export const stopProgram = (now: string): { maintenanceFrom: string } => ({ maintenanceFrom: nextMonday(now) });
