import { dateOf, daysBetween } from "./dates.ts";
import type { Activity, Lap, Paces, RunType } from "./types.ts";

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

/**
 * F7, s/km, one target pace per zone (C4). F8: T never faster than critical speed when known.
 * T and I at 88 % and 97.5 % of VDOT: the fractions that reproduce Daniels' table 5.2 within 3 s/km, VDOT 30 to 85.
 * E at the fast end of Daniels' easy band (59 to 74 %, research 09): a plan to race her best, still easy.
 */
export const E_FRACTION = 0.74;

export function paces(v: number, criticalSpeedMpm?: number): Paces {
  const I = paceOf(speedForVo2(0.975 * v));
  const tSpeed = speedForVo2(0.88 * v);
  const capped = criticalSpeedMpm !== undefined && tSpeed > criticalSpeedMpm ? criticalSpeedMpm : tSpeed;
  return {
    E: paceOf(speedForVo2(E_FRACTION * v)),
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

/** F9: Riegel's range ends at 230 min; Daniels' table 5.1 covers the marathon down to VDOT 30, 4:49:17. */
const EFFORT_MAX_MIN = 230;
const MARATHON_MAX_MIN = 290;
/** A GPS track runs a little long: a marathon measured up to 2 % over is still a marathon. */
const GPS_SLACK = 1.02;

/**
 * F9. Wind and surface are not in Activity, so only heat is checked. A marked race up to the marathon is read up to
 * the slowest marathon of Daniels' table.
 * shortcut: any grade >= 1 % is refused, no Minetti correction; add it when elevation profiles are synced.
 */
export function isEligibleEffort(a: Activity, ctx: { hrMax: number; lthr?: number }): Eligibility {
  const maxMin = a.isRace === true && a.distM <= GPS_SLACK * MARATHON_M ? MARATHON_MAX_MIN : EFFORT_MAX_MIN;
  if (a.durMin < 3 || a.durMin > maxMin) return { ok: false, reason: "duration" };
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
  /** Her last race time, or her estimate when `date` is absent (« Ton dernier chrono »). */
  declared?: { distM: number; tMin: number; date?: string };
  /** Without it only races and tests can prove a maximal effort. */
  hr?: { hrMax: number; lthr?: number };
};

/**
 * F18. "race": a maximal effort, read with F3. "threshold": 15 to 60 min held in Daniels' T heart-rate band, so
 * its pace is her T pace (F7 inverted). "training": any other segment of 10 min or more, a floor only.
 */
export type EffortReading = {
  activityId: string;
  start: string;
  distM: number;
  durMin: number;
  vdot: number;
  kind: "race" | "threshold" | "training";
};

const EFFORT_DAYS = 84;
const RECENT_DAYS = 42;
const DECLARED_DAYS = 182;
/** Daniels' T band: 88 to 92 % of HRmax. */
const T_HR: [number, number] = [0.88, 0.92];
const T_FRACTION = 0.88;
/** Daniels: T is the pace held for about an hour in a race; held longer at T heart rate, it is a race (a half). */
const T_MAX_MIN = 60;
/** Sanity bounds: GPS glitches and walks left out (2:30 to 12:00 /km), VDOT outside any runner's range. */
const SPEED_MPM: [number, number] = [1000 / 12, 400];
const VDOT_RANGE: [number, number] = [20, 85];

/** Laps within 3 % of each other's speed make one continuous effort; reps with their recoveries never do. */
const STEADY = 1.03;
/** A maximal reading from laps needs a sustained effort: a 3 min rep is not an all-out 3 min (Daniels). */
const RACE_LAPS_MIN = 10;
/** Planned interval work: its laps are reps and recoveries, never one effort (F18). */
const INTERVALS = new Set<RunType>(["I", "R", "CRUISE", "FARTLEK"]);

type Stretch = { distM: number; durMin: number; hr?: number; laps?: true };

const lapSpeed = (lap: Lap): number => (lap.durMin > 0 ? lap.distM / lap.durMin : 0);

/** A lap out of the sanity bounds (GPS jump, pause): nothing is read across it. */
const saneLap = (lap: Lap): boolean => lapSpeed(lap) >= SPEED_MPM[0] && lapSpeed(lap) <= SPEED_MPM[1];

/** The steady stretches that start at the first lap given, longer and longer, up to 60 min. */
function stretchesFrom(laps: Lap[]): Stretch[] {
  const out: Stretch[] = [];
  const acc = { distM: 0, durMin: 0, beats: 0, timed: 0 };
  const first = laps[0] ? lapSpeed(laps[0]) : 0;
  let [lo, hi] = [first, first];
  for (const lap of laps) {
    [lo, hi] = [Math.min(lo, lapSpeed(lap)), Math.max(hi, lapSpeed(lap))];
    if (!saneLap(lap) || acc.durMin + lap.durMin > 60 || hi > STEADY * lo) break;
    acc.distM += lap.distM;
    acc.durMin += lap.durMin;
    acc.beats += (lap.avgHr ?? 0) * lap.durMin;
    acc.timed += lap.avgHr === undefined ? 0 : lap.durMin;
    const hr = acc.timed === acc.durMin ? { hr: acc.beats / acc.timed } : {};
    out.push({ distM: acc.distM, durMin: acc.durMin, ...hr, laps: true });
  }
  return out;
}

/** Past an hour, heart rate drifts up at a steady pace (Coyle and González-Alonso 2001): it no longer tells intensity. */
const DRIFT_MIN = 60;

/**
 * Every steady run of consecutive laps up to 60 min, with its time-weighted heart rate when every lap has one and
 * the stretch starts within the first hour. None for a planned interval session.
 */
const lapWindows = (a: Activity): Stretch[] => {
  const laps = a.plannedType && INTERVALS.has(a.plannedType) ? [] : (a.laps ?? []);
  let elapsed = 0;
  return laps.flatMap((lap, i) => {
    const drifted = elapsed >= DRIFT_MIN;
    elapsed += lap.durMin;
    return stretchesFrom(laps.slice(i)).map(({ hr, ...s }) => (drifted || hr === undefined ? s : { ...s, hr }));
  });
};

type Read = Pick<EffortReading, "vdot" | "kind">;

function readStretch(s: Stretch, hrMax: number | undefined): Read | null {
  const v = s.distM / s.durMin;
  if (s.durMin < 3 || v < SPEED_MPM[0] || v > SPEED_MPM[1]) return null;
  const ratio = hrMax !== undefined && s.hr !== undefined ? s.hr / hrMax : 0;
  const raced = ratio >= T_HR[1] || (ratio >= T_HR[0] && s.durMin > T_MAX_MIN);
  if (raced && (!s.laps || s.durMin >= RACE_LAPS_MIN)) return { vdot: vdot(s.distM, s.durMin), kind: "race" };
  if (ratio >= T_HR[0] && s.durMin >= 15)
    return { vdot: Math.max(vdot(s.distM, s.durMin), vo2(v) / T_FRACTION), kind: "threshold" };
  return s.durMin >= 10 ? { vdot: vdot(s.distM, s.durMin), kind: "training" } : null;
}

/** A race or threshold reading outranks a floor even when the floor reads higher. */
const better = (x: Read, y: Read): number =>
  Number(y.kind !== "training") - Number(x.kind !== "training") || y.vdot - x.vdot;

const inRange = (r: Read | null): r is Read => r !== null && r.vdot >= VDOT_RANGE[0] && r.vdot <= VDOT_RANGE[1];

/**
 * F18: the best reading of each flat run of the last 12 weeks, whole run (F9) or consecutive laps. In a run read as a
 * race, only maximal laps are read; no lap reading stands below the whole run (research 01 §4.2).
 */
export function effortReadings(h: FitnessHistory, now: string): EffortReading[] {
  return h.activities.flatMap((a) => {
    if (a.start > now || daysBetween(a.start, now) > EFFORT_DAYS || a.distM <= 0) return [];
    if ((a.elevGainM ?? 0) / a.distM >= 0.01) return [];
    const best = bestReading(a, h.hr);
    return best ? [{ activityId: a.id, start: a.start, distM: a.distM, durMin: a.durMin, ...best }] : [];
  });
}

function bestReading(a: Activity, hr: FitnessHistory["hr"]): Read | undefined {
  const hrMax = hr?.hrMax;
  const whole: Read | null = isEligibleEffort(a, hr ?? { hrMax: Number.POSITIVE_INFINITY }).ok
    ? { vdot: vdot(a.distM, a.durMin), kind: "race" }
    : readStretch({ distM: a.distM, durMin: a.durMin, ...(a.avgHr === undefined ? {} : { hr: a.avgHr }) }, hrMax);
  const run = inRange(whole) ? whole : undefined;
  // Within a race, a stretch at threshold heart rate is race pace, not T pace; a faster maximal lap still counts.
  const laps = lapWindows(a)
    .map((w) => readStretch(w, hrMax))
    .filter((r): r is Read => inRange(r) && (run?.kind !== "race" || r.kind === "race"))
    .sort(better)[0];
  return run && (!laps || laps.vdot < run.vdot) ? run : laps;
}

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

type Candidate = { v: number; source: string };
const highest = (xs: (Candidate | undefined)[]): Candidate | undefined =>
  xs.filter((c) => c !== undefined).sort((x, y) => y.v - x.v)[0];

/**
 * F10 (a, b): the higher of the best race or threshold reading of 6 weeks and the best of 6 to 12 weeks, detrained
 * by the longest break since.
 */
function measuredLevel(h: FitnessHistory, readings: EffortReading[], now: string): Candidate | undefined {
  const strong = readings.filter((r) => r.kind !== "training");
  const isRecent = (r: EffortReading): boolean => daysBetween(r.start, now) <= RECENT_DAYS;
  const recent = highest(strong.filter(isRecent).map((r) => ({ v: r.vdot, source: `effort:${r.activityId}` })));
  const older = strong.filter((r) => !isRecent(r)).sort((x, y) => y.vdot - x.vdot)[0];
  const detrained = older && {
    v: older.vdot * detrainingFactor(longestGap(h.activities, older.start, now)),
    source: `effort:${older.activityId}:detrained`,
  };
  return highest([recent, detrained]);
}

/**
 * F10. The most credible level, not the slowest: the higher of the best measured effort and a declared time of
 * 6 months or less; else the lower of Garmin VO2max and an older declared time. Never below what a run of the last
 * 6 weeks proves (F18 floor). Throws NO_FITNESS_DATA without any of the first three: the app then asks for a time.
 */
export function initialFitness(h: FitnessHistory, now: string): InitialFitness {
  const readings = effortReadings(h, now);
  const measured = measuredLevel(h, readings, now);
  const d = h.declared;
  const declared = d && { v: vdot(d.distM, d.tMin), source: "declared" };
  // A test or race she ran since says more than her own word: the declared time then steps aside (Daniels).
  const raced = (id: string): boolean =>
    h.activities.some(
      (a) => a.id === id && (a.isTest || a.isRace) && (d?.date === undefined || dateOf(a.start) > d.date),
    );
  const superseded = readings.some((r) => r.kind === "race" && raced(r.activityId));
  const fresh = d !== undefined && !superseded && (d.date === undefined || daysBetween(d.date, now) <= DECLARED_DAYS);
  const weak = [h.vo2maxGarmin === undefined ? undefined : { v: h.vo2maxGarmin, source: "garmin_vo2max" }];
  if (!fresh) weak.push(declared);
  const prior =
    highest([measured, fresh ? declared : undefined]) ??
    weak.filter((c) => c !== undefined).sort((x, y) => x.v - y.v)[0];
  const floor = highest(
    readings
      .filter((r) => daysBetween(r.start, now) <= RECENT_DAYS)
      .map((r) => ({ v: r.vdot, source: `floor:${r.activityId}` })),
  );
  // The floor is a bound, not a level: alone it says nothing of how fast she could go.
  if (!prior) throw new Error("NO_FITNESS_DATA");
  const chosen = highest([prior, floor]) ?? prior;
  if (chosen === measured) return { vdot: chosen.v, status: "measured", source: chosen.source };
  return { vdot: chosen.v, status: "provisional", source: chosen.source, testWeek: [2, 4] };
}

/** F19: Garmin's VO2max and the VDOT of her last race agree within this many points (Engel 2025's mean gap). */
const VO2MAX_AGREE = 5;

/** F19. What Garmin says of her level next to her own race, for « Ta montre ». Informative only: F17 still holds. */
export function vo2maxVersusRace(
  vo2maxGarmin: number,
  race: { distM: number; tMin: number },
): "agrees" | "above" | "below" {
  const gap = vo2maxGarmin - vdot(race.distM, race.tMin);
  if (Math.abs(gap) < VO2MAX_AGREE) return "agrees";
  return gap > 0 ? "above" : "below";
}

/** F12: another run within 3 bpm confirms a maximum. */
const HR_CONFIRM = 3;
/** F12: a maximum reached in a run held at 85 % of it or more ends a hard effort, not a wrist spike in a footing. */
const HARD_RUN = 0.85;

/**
 * F12 with what Garmin gives (one maximum per run, no second-by-second series): the highest maximum when another
 * run confirms it within 3 bpm or its own run was hard, else the next one (a spike of the wrist sensor).
 */
export function observedHrMax(runs: { maxHr: number; avgHr?: number }[]): number | undefined {
  const [top, next] = [...runs].sort((a, b) => b.maxHr - a.maxHr);
  if (!top || !next) return top?.maxHr;
  const credible = top.maxHr - next.maxHr <= HR_CONFIRM || (top.avgHr ?? 0) >= HARD_RUN * top.maxHr;
  return credible ? top.maxHr : next.maxHr;
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

/** F14: the app's TEST is one 20 min lap all out; threshold heart rate is 95 % of its mean (Friel). */
const TEST_LAP_MIN = 20;
const TEST_LTHR_SHARE = 0.95;

/**
 * F14, from the 20 min lap of the app's test, else from an evenly sampled heart-rate series. Undefined when the
 * effort does not qualify.
 */
export function lthrFromEffort(a: Activity): number | undefined {
  const lap = a.isTest ? a.laps?.find((l) => Math.abs(l.durMin - TEST_LAP_MIN) <= 1) : undefined;
  if (lap?.avgHr !== undefined) return TEST_LTHR_SHARE * lap.avgHr;
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
