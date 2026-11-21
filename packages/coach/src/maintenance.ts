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

/** P23, MA6: share of the usual volume in each of the two weeks after the race. */
const POST_RACE_SHARE = { 1: 0.45, 2: 0.65 } as const;
export type PostRaceWeek = keyof typeof POST_RACE_SHARE;
/** MA6: the two post-race weeks start within 14 days of the race. */
const POST_RACE_DAYS = 14;

/**
 * P23, MA6: easy runs only, 45 % of the usual volume the first week after the race and 65 % the second, never
 * shorter than a 20 min footing.
 */
export function postRaceWeek(usualMin: number, paces: Paces, runs = 3, week: PostRaceWeek = 1): Session[] {
  const each = Math.max(20, Math.floor((POST_RACE_SHARE[week] * usualMin) / runs));
  const ctx: BuildCtx = { weeklyMin: usualMin, paces, phase: "base", progressionStep: 0, distM: 10000, durMin: each };
  return [...Array(runs).keys()].map((i) => ({ ...buildSession("E", ctx), id: `post-race-${week}-${i}` }));
}

/**
 * MA6: the day of the last race before `monday`: the goal's date once it is past, else the last run marked as the
 * goal race (« Garder la forme » clears the goal, not the two easy weeks).
 */
export function lastRaceDay(goal: Goal, history: Activity[], monday: string): string | undefined {
  if (goal && goal.date < monday) return goal.date;
  return history
    .filter((a) => a.isRace && dateOf(a.start) < monday)
    .map((a) => dateOf(a.start))
    .sort()
    .at(-1);
}

/** MA6: which of the two post-race weeks starts on `monday`, or null outside them. */
export function postRaceIndex(raceDay: string, monday: string): PostRaceWeek | null {
  const days = daysBetween(raceDay, monday);
  if (days <= 0 || days > POST_RACE_DAYS) return null;
  return days <= 7 ? 1 : 2;
}

/** MA7: V0 = mean of the maintenance weeks, plan from next Monday. */
export const exitMaintenance = (history4w: number[], now: string): { v0: number; planStart: string } => ({
  v0: mean(history4w),
  planStart: nextMonday(now),
});

/** MA8: stopping the programme switches to maintenance next Monday; the current week stays. */
export const stopProgram = (now: string): { maintenanceFrom: string } => ({ maintenanceFrom: nextMonday(now) });
