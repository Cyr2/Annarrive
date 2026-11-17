import { type BuildCtx, buildSession } from "./catalog.ts";
import { nextMonday } from "./dates.ts";
import type { Paces, RunType, Session, Settings } from "./types.ts";

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

/** P23, MA6: one week of easy runs at 45 % of the usual volume, never shorter than a 20 min footing. */
export function postRaceWeek(usualMin: number, paces: Paces, runs = 3): Session[] {
  const each = Math.max(20, Math.floor((0.45 * usualMin) / runs));
  const ctx: BuildCtx = { weeklyMin: usualMin, paces, phase: "base", progressionStep: 0, distM: 10000, durMin: each };
  return [...Array(runs).keys()].map((i) => ({ ...buildSession("E", ctx), id: `post-race-${i}` }));
}

/** MA7: V0 = mean of the maintenance weeks, plan from next Monday. */
export const exitMaintenance = (history4w: number[], now: string): { v0: number; planStart: string } => ({
  v0: mean(history4w),
  planStart: nextMonday(now),
});

/** MA8: stopping the programme switches to maintenance next Monday; the current week stays. */
export const stopProgram = (now: string): { maintenanceFrom: string } => ({ maintenanceFrom: nextMonday(now) });
