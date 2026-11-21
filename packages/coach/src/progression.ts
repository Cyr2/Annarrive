import { addDays, dateOf } from "./dates.ts";
import { paces, predictTime } from "./fitness.ts";
import type { Session } from "./types.ts";

/** A level as `fitness_estimate` keeps it: one per day it changed, never rewritten afterwards. */
export type LevelEntry = { date: string; vdot: number; source: string };
type PlannedRun = Pick<Session, "id" | "start" | "durMin" | "status">;
type Run = { start: string; durMin: number; sessionId?: string };

/** PR3: a run kept is one run for at least this share of its planned time (the `cut` line of Aujourd'hui). */
export const KEPT_SHARE = 0.8;

const byDate = (a: LevelEntry, b: LevelEntry): number => a.date.localeCompare(b.date);

/** PR1: the level in service on `day`, the latest set on or before it. */
export function levelOn(levels: LevelEntry[], day: string): LevelEntry | undefined {
  return levels
    .filter((l) => l.date <= day)
    .sort(byDate)
    .at(-1);
}

/** PR1: her race time (min) with the level in service at the end of each week begun by `today`; none for weeks ahead. */
export function weeklyEstimates(
  levels: LevelEntry[],
  mondays: string[],
  distM: number,
  today: string,
): (number | undefined)[] {
  return mondays.map((monday) => {
    if (monday > today) return undefined;
    const sunday = addDays(monday, 6);
    const level = levelOn(levels, sunday < today ? sunday : today);
    return level && predictTime(level.vdot, distM);
  });
}

const inWeek = (iso: string, monday: string): boolean => dateOf(iso) >= monday && dateOf(iso) < addDays(monday, 7);
const minutes = (xs: { durMin: number }[]): number => xs.reduce((sum, x) => sum + x.durMin, 0);

/**
 * PR2: minutes planned in the week (every stored run but a cancelled one; a week not built yet takes the plan's
 * volume) and minutes run (every synced run, planned or not).
 */
export function weekVolume(
  sessions: PlannedRun[],
  runs: Run[],
  monday: string,
  planMin = 0,
): { plannedMin: number; doneMin: number } {
  const planned = sessions.filter((s) => s.status !== "cancelled" && inWeek(s.start, monday));
  return {
    plannedMin: planned.length > 0 ? minutes(planned) : planMin,
    doneMin: minutes(runs.filter((r) => inWeek(r.start, monday))),
  };
}

/**
 * PR3: runs kept since `from`, out of the runs whose fate is known (done, missed, skipped). A done run is kept when
 * its synced runs reach 80 % of its planned time, or when she confirmed it without the watch (EV21: her word).
 */
export function keptRuns(sessions: PlannedRun[], runs: Run[], from: string): { kept: number; total: number } {
  const known = sessions.filter((s) => dateOf(s.start) >= from && ["done", "missed", "skipped"].includes(s.status));
  const kept = known.filter((s) => {
    const matched = runs.filter((r) => r.sessionId === s.id);
    return s.status === "done" && (matched.length === 0 || minutes(matched) >= KEPT_SHARE * s.durMin);
  });
  return { kept: kept.length, total: known.length };
}

/** A level change for the detail sheet: the race time it predicts and the easy pace (s/km) before and after. */
export type LevelChange = LevelEntry & { predictedMin: number; easyFrom?: number; easyTo: number };

/** PR4: the level in service at `from` (her start, no `easyFrom`), then each change after it, oldest first. */
export function levelChanges(levels: LevelEntry[], from: string, distM: number): LevelChange[] {
  const start = levelOn(levels, from);
  const kept = [...(start ? [start] : []), ...levels.filter((l) => l.date > from).sort(byDate)];
  return kept.map((level, i) => {
    const before = kept[i - 1];
    return {
      ...level,
      predictedMin: predictTime(level.vdot, distM),
      easyTo: paces(level.vdot).E,
      ...(before ? { easyFrom: paces(before.vdot).E } : {}),
    };
  });
}
