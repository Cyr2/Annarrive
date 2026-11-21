import { daysBetween } from "./dates.ts";
import { lthrFromEffort, predictTime, riegel } from "./fitness.ts";
import type { Activity } from "./types.ts";

const HALF_M = 21097.5;
const MARATHON_M = 42195;
/** NV1: the distances « Tes chronos possibles » lists, shortest first. */
export const RACE_DISTANCES = [5000, 10000, HALF_M, MARATHON_M];

/** NV2 (research 07 §2.3): F6's volume, and the long runs a marathon time needs before it means anything. */
const VOLUME_MIN = { enough: 240, some: 150 };
const LONG_RUN_MIN = { enough: 105, some: 75 };

export type RacePrediction = { distM: number; min?: number; bestCase?: true };
/** Her running of the last 8 weeks (mean minutes a week) and her longest run of the last 6 weeks (min). */
export type Volume = { avgWeeklyMin: number; longestRunMin: number };

/**
 * NV1 and NV2: her time on each distance from the level in service (F5). The marathon is Daniels' with enough volume
 * and long runs; the slower of Daniels and Riegel 1.07 from her half (F6), a best case, with some; none without.
 */
export function racePredictions(v: number, volume: Volume): RacePrediction[] {
  return RACE_DISTANCES.map((distM) => {
    const min = predictTime(v, distM);
    if (distM !== MARATHON_M) return { distM, min };
    const { avgWeeklyMin: week, longestRunMin: long } = volume;
    if (week < VOLUME_MIN.some || long < LONG_RUN_MIN.some) return { distM };
    if (week >= VOLUME_MIN.enough && long >= LONG_RUN_MIN.enough) return { distM, min };
    return { distM, min: Math.max(min, riegel(predictTime(v, HALF_M), HALF_M, distM)), bestCase: true };
  });
}

export type ThresholdHr = { bpm: number; from: "test" | "race" | "laps"; date: string };

/** NV3: a measure of her threshold heart rate holds 8 weeks, as LTHR does for the zones (F13). */
const THRESHOLD_DAYS = 56;
/** NV3: laps within 3 % of her T pace, 15 min in a row, read after their first 5 min (cardiac lag, wrist sensor). */
const T_PACE_SPAN = 0.03;
const T_LAPS_MIN = 15;
const WARM_MIN = 5;
const T_SESSIONS = 2;

/** The heart rate of her longest stretch of laps at T pace, read after its first 5 min; none under 15 min. */
export function thresholdLapsHr(a: Activity, tPace: number): number | undefined {
  let best: { durMin: number; hr?: number } = { durMin: 0 };
  let run = { durMin: 0, beats: 0, timed: 0 };
  for (const lap of [...(a.laps ?? []), undefined]) {
    const pace = lap && lap.distM > 0 ? (lap.durMin * 60_000) / lap.distM : 0;
    if (lap?.avgHr !== undefined && Math.abs(pace / tPace - 1) <= T_PACE_SPAN) {
      // Only the laps that start after the warm-up minutes carry her heart rate at threshold.
      if (run.durMin >= WARM_MIN) [run.beats, run.timed] = [run.beats + lap.avgHr * lap.durMin, run.timed + lap.durMin];
      run.durMin += lap.durMin;
      continue;
    }
    if (run.durMin >= T_LAPS_MIN && run.durMin > best.durMin && run.timed > 0)
      best = { durMin: run.durMin, hr: run.beats / run.timed };
    run = { durMin: 0, beats: 0, timed: 0 };
  }
  return best.hr;
}

/**
 * NV3: her threshold heart rate, from the latest test or 50 to 65 min race of 8 weeks (F14), else from her
 * laps at T pace in 2 runs of 8 weeks (the mean of the latest two). Unknown otherwise: never a share of HRmax.
 */
export function thresholdHr(activities: Activity[], tPace: number, now: string): ThresholdHr | undefined {
  const recent = activities
    .filter((a) => a.start <= now && daysBetween(a.start, now) <= THRESHOLD_DAYS)
    .sort((x, y) => y.start.localeCompare(x.start));
  for (const a of recent) {
    const bpm = lthrFromEffort(a);
    if (bpm !== undefined)
      return { bpm: Math.round(bpm), from: a.isTest ? "test" : "race", date: a.start.slice(0, 10) };
  }
  const laps = recent.flatMap((a) => {
    const hr = thresholdLapsHr(a, tPace);
    return hr === undefined ? [] : [{ hr, date: a.start.slice(0, 10) }];
  });
  const latest = laps.slice(0, T_SESSIONS);
  if (latest.length < T_SESSIONS || !latest[0]) return undefined;
  const bpm = Math.round(latest.reduce((sum, l) => sum + l.hr, 0) / latest.length);
  return { bpm, from: "laps", date: latest[0].date };
}
