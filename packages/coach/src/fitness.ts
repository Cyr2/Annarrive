import { daysBetween } from "./dates.ts";
import type { Activity, Paces, RunType } from "./types.ts";

/** F1, v in m/min. */
export const vo2 = (vMpm: number): number => -4.6 + 0.182258 * vMpm + 0.000104 * vMpm * vMpm;

/** F2: fraction of VO2max sustainable for t minutes. */
export const fractionF = (tMin: number): number =>
  0.8 + 0.1894393 * Math.exp(-0.012778 * tMin) + 0.2989558 * Math.exp(-0.1932605 * tMin);

/** F3. */
export const vdot = (distM: number, tMin: number): number => vo2(distM / tMin) / fractionF(tMin);

/** F4: speed (m/min) whose cost is x ml/kg/min. */
export const speedForVo2 = (x: number): number =>
  (-0.182258 + Math.sqrt(0.182258 ** 2 + 4 * 0.000104 * (4.6 + x))) / (2 * 0.000104);

export const riegel = (t1Min: number, d1M: number, d2M: number): number => t1Min * (d2M / d1M) ** 1.07;

const MARATHON_M = 42195;
const LOW_VOLUME_MIN = 240;

/**
 * F5 (+ F6 when `marathonCtx` is given): predicted time in minutes.
 * F6 keeps the slower of the formula and Riegel for a marathon on low volume.
 */
export function predictTime(
  v: number,
  distM: number,
  marathonCtx?: { avgWeeklyMin: number; ref: { distM: number; tMin: number } },
): number {
  let lo = distM / 500;
  let hi = distM / 50;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (v * fractionF(mid) - vo2(distM / mid) > 0) hi = mid;
    else lo = mid;
  }
  const formula = (lo + hi) / 2;
  if (distM !== MARATHON_M || !marathonCtx || marathonCtx.avgWeeklyMin >= LOW_VOLUME_MIN) return formula;
  return Math.max(formula, riegel(marathonCtx.ref.tMin, marathonCtx.ref.distM, distM));
}

const paceOf = (vMpm: number): number => 60_000 / vMpm;

/** F7, s/km. E is a range [fast, slow] (C4). F8: T never faster than critical speed when known. */
export function paces(v: number, criticalSpeedMpm?: number): Paces {
  const I = paceOf(speedForVo2(fractionF(11) * v));
  const tSpeed = speedForVo2(fractionF(60) * v);
  const capped = criticalSpeedMpm !== undefined && tSpeed > criticalSpeedMpm ? criticalSpeedMpm : tSpeed;
  return {
    E: [paceOf(speedForVo2(0.74 * v)), paceOf(speedForVo2(0.59 * v))],
    M: (predictTime(v, MARATHON_M) * 60) / (MARATHON_M / 1000),
    T: paceOf(capped),
    I,
    R: I - 15,
  };
}

export type Eligibility = { ok: boolean; reason?: "duration" | "grade" | "not_max" | "conditions" };

const secondHalfHr = (a: Activity): number | undefined => {
  const s = a.hrSeries;
  if (!s || s.length < 2) return a.avgHr;
  const half = s.slice(Math.floor(s.length / 2));
  return half.reduce((x, y) => x + y, 0) / half.length;
};

/**
 * F9. Wind and surface are not in Activity, so only heat is checked.
 * shortcut: any grade >= 1 % is refused, no Minetti correction; add it when elevation profiles are synced.
 */
export function isEligibleEffort(a: Activity, ctx: { hrMax: number; lthr?: number }): Eligibility {
  if (a.durMin < 3 || a.durMin > 230) return { ok: false, reason: "duration" };
  if ((a.elevGainM ?? 0) / a.distM >= 0.01) return { ok: false, reason: "grade" };
  const hr = secondHalfHr(a) ?? 0;
  const maximal =
    a.isRace === true ||
    a.isTest === true ||
    hr >= 0.9 * ctx.hrMax ||
    (ctx.lthr !== undefined && hr >= 0.97 * ctx.lthr);
  if (!maximal) return { ok: false, reason: "not_max" };
  if ((a.tempC ?? 0) > 20) return { ok: false, reason: "conditions" };
  return { ok: true };
}

/** F11: linear interpolation, constant past 70 days. */
export function detrainingFactor(daysOff: number, crossTrainingPerWeek = 0): number {
  const points: [number, number][] = [
    [5, 1],
    [14, crossTrainingPerWeek >= 3 ? 0.986 : 0.973],
    [21, 0.95],
    [70, 0.8],
  ];
  let prev: [number, number] = [0, 1];
  for (const p of points) {
    if (daysOff <= p[0]) return prev[1] + ((p[1] - prev[1]) * (daysOff - prev[0])) / (p[0] - prev[0]);
    prev = p;
  }
  return 0.8;
}

export type InitialFitness = {
  vdot: number;
  status: "measured" | "provisional";
  source: string;
  testWeek?: [2, 4];
};

export type FitnessHistory = {
  activities: Activity[];
  vo2maxGarmin?: number;
  declared?: { distM: number; tMin: number };
  /** Without it only races and tests can prove a maximal effort. */
  hr?: { hrMax: number; lthr?: number };
};

/** Longest gap in days between runs from `fromIso` up to now. */
function longestGap(activities: Activity[], fromIso: string, now: string): number {
  const days = activities
    .map((a) => a.start)
    .filter((s) => s >= fromIso && s <= now)
    .concat(now)
    .sort();
  let gap = 0;
  for (let i = 1; i < days.length; i++) gap = Math.max(gap, daysBetween(days[i - 1] ?? now, days[i] ?? now));
  return gap;
}

/** F10. Throws NO_FITNESS_DATA when nothing is known: the app then asks for a time or plans a test in week 1. */
export function initialFitness(h: FitnessHistory, now: string): InitialFitness {
  const ctx = h.hr ?? { hrMax: Number.POSITIVE_INFINITY };
  const eligible = h.activities
    .filter((a) => isEligibleEffort(a, ctx).ok)
    .map((a) => ({ a, v: vdot(a.distM, a.durMin), age: daysBetween(a.start, now) }));
  const recent = eligible.filter((e) => e.age <= 42).sort((x, y) => y.v - x.v)[0];
  if (recent) return { vdot: recent.v, status: "measured", source: `effort:${recent.a.id}` };
  const older = eligible.filter((e) => e.age <= 84).sort((x, y) => y.v - x.v)[0];
  if (older) {
    const factor = detrainingFactor(longestGap(h.activities, older.a.start, now));
    return { vdot: older.v * factor, status: "measured", source: `effort:${older.a.id}:detrained` };
  }
  const candidates = [
    h.vo2maxGarmin !== undefined ? { v: h.vo2maxGarmin, source: "garmin_vo2max" } : null,
    h.declared ? { v: vdot(h.declared.distM, h.declared.tMin), source: "declared" } : null,
  ].filter((c) => c !== null);
  const lowest = candidates.sort((x, y) => x.v - y.v)[0];
  if (!lowest) throw new Error("NO_FITNESS_DATA");
  return { vdot: lowest.v, status: "provisional", source: lowest.source, testWeek: [2, 4] };
}

/** F12. Null when neither age nor heart rate is known: pilot by RPE. */
export function hrMax(
  observedMax12m: number | undefined,
  age: number | undefined,
): { value: number; estimated: boolean } | null {
  if (age === undefined) return observedMax12m === undefined ? null : { value: observedMax12m, estimated: false };
  const tanaka = 208 - 0.7 * age;
  if (observedMax12m !== undefined && observedMax12m >= 0.95 * tanaka)
    return { value: observedMax12m, estimated: false };
  return { value: Math.round(Math.max(observedMax12m ?? 0, tanaka) * 10) / 10, estimated: true };
}

export type Zones = { method: "friel" | "karvonen"; E: [number, number]; T: [number, number] };

/** F13. With LTHR, E is Friel zone 2 and T zones 4 to 5a. */
export function hrZones(max: number, rhr7: number, lthr?: number): Zones {
  if (lthr !== undefined) {
    return {
      method: "friel",
      E: [Math.round(0.85 * lthr), Math.round(0.89 * lthr)],
      T: [Math.round(0.95 * lthr), Math.round(1.02 * lthr)],
    };
  }
  const k = (pct: number): number => Math.round(rhr7 + pct * (max - rhr7));
  return { method: "karvonen", E: [k(0.59), k(0.74)], T: [k(0.84), k(0.88)] };
}

/** F14, from an evenly sampled heart-rate series. Undefined when the effort does not qualify. */
export function lthrFromEffort(a: Activity): number | undefined {
  const s = a.hrSeries;
  if (!s || s.length === 0) return undefined;
  const at = (min: number): number => Math.floor((min / a.durMin) * s.length);
  const mean = (xs: number[]): number => xs.reduce((x, y) => x + y, 0) / xs.length;
  if (a.isTest && Math.abs(a.durMin - 30) <= 1) return mean(s.slice(at(10)));
  if (a.isRace && a.durMin >= 50 && a.durMin <= 65) return mean(s.slice(at(a.durMin - 10)));
  return undefined;
}

export type Segment = { startMin: number; durMin: number; gradePct: number; tempC?: number; vMpm: number; hr: number };

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? (s[mid] ?? 0) : ((s[mid - 1] ?? 0) + (s[mid] ?? 0)) / 2;
};

/** F15: Theil-Sen fit HR = a + b·v on stable segments; null means keep the previous model. */
export function hrPaceModel(segments: Segment[]): { a: number; b: number } | null {
  const ok = segments.filter(
    (s) => s.durMin >= 5 && Math.abs(s.gradePct) < 2 && s.startMin >= 10 && (s.tempC ?? 0) < 20,
  );
  if (ok.length < 6) return null;
  const slopes: number[] = [];
  ok.forEach((p, i) => {
    for (const q of ok.slice(i + 1)) if (q.vMpm !== p.vMpm) slopes.push((q.hr - p.hr) / (q.vMpm - p.vMpm));
  });
  const b = median(slopes);
  return { a: median(ok.map((s) => s.hr - b * s.vMpm)), b };
}

/** F16. Conditions can only move toward a more conservative pilot. */
export function pilotFor(type: RunType, adverse = false): "pace" | "hr" | "rpe" {
  if (type === "E" || type === "RECUP" || type === "L") return "hr";
  if (type === "T" || type === "CRUISE" || type === "SPE" || type === "I") return adverse ? "hr" : "pace";
  return "rpe";
}
