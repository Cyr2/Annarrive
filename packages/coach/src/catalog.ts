import { fractionF, paces, pilotFor, speedForVo2, vdot, vo2 } from "./fitness.ts";
import type { Feel, Paces, PaceZone, Phase, RunType, Session, Step } from "./types.ts";

const WARMUP_MIN = 15;
const COOLDOWN_MIN = 10;

export const RPE: Record<RunType, number> = {
  E: 3,
  RECUP: 2,
  L: 4,
  T: 7,
  CRUISE: 7,
  I: 8,
  R: 8,
  SPE: 6,
  FARTLEK: 5,
  TEST: 9,
  RACE: 9,
};

const PRIORITY: Record<RunType, Session["priority"]> = {
  L: 1,
  T: 2,
  CRUISE: 2,
  I: 2,
  R: 2,
  SPE: 2,
  TEST: 2,
  RACE: 1,
  FARTLEK: 3,
  E: 4,
  RECUP: 5,
};

export type BuildCtx = {
  weeklyMin: number;
  paces: Paces;
  phase: Phase;
  progressionStep: number;
  distM: number;
  /** Length of continuous runs (E, RECUP, L, FARTLEK). */
  durMin?: number;
  strides?: boolean;
  /** E + short sprints on the flat with full recoveries (P12), in place of hill sprints. */
  sprints?: boolean;
  /** Race-pace target for SPE (P21); defaults to M. */
  racePaceSKm?: number;
  /** A deload week (P9): its long run stays easy (P12). */
  deload?: boolean;
};

export const stepTotal = (s: Step): number => s.durMin * (s.reps ?? 1);
const total = (steps: Step[]): number => steps.reduce((sum, s) => sum + stepTotal(s), 0);

/** C4: a recovery run sits a little under E (Daniels: the slow end of E). */
const RECOVERY_SLOWER_S = 15;

/** One target pace, as a [fast, slow] pair the watch widens into its zone (C4). */
export function paceFor(zone: PaceZone, p: Paces, race?: number): [number, number] {
  const v = zone === "race" ? (race ?? p.M) : p[zone];
  return [v, v];
}

const recovery = (st: Step): Step =>
  st.zone === "E" && st.target.paceSKm
    ? {
        ...st,
        target: {
          ...st.target,
          paceSKm: [st.target.paceSKm[0] + RECOVERY_SLOWER_S, st.target.paceSKm[1] + RECOVERY_SLOWER_S],
        },
      }
    : st;

const step = (
  kind: Step["kind"],
  durMin: number,
  zone: PaceZone,
  p: Paces,
  rpe: number,
  extra: Partial<Step> = {},
): Step => ({
  kind,
  durMin,
  zone,
  target: { paceSKm: paceFor(zone, p), rpe },
  ...extra,
});

export function makeSession(type: RunType, steps: Step[], base: Partial<Session> = {}): Session {
  return {
    id: "",
    start: "",
    priority: PRIORITY[type],
    status: "planned",
    manual: false,
    frozen: false,
    ...base,
    type,
    steps,
    durMin: total(steps),
    rpeTarget: RPE[type],
    pilot: pilotFor(type),
  };
}

/** Q wrapper: 15 min E warm-up, body, 10 min E cool-down. */
const quality = (type: RunType, body: Step[], p: Paces): Session =>
  makeSession(type, [step("warmup", WARMUP_MIN, "E", p, 3), ...body, step("cooldown", COOLDOWN_MIN, "E", p, 3)]);

/** Work fractions and the recoveries between them (n - 1). */
function intervals(
  reps: number,
  workMin: number,
  zone: PaceZone,
  p: Paces,
  rpe: number,
  recMin: number,
  distM?: number,
): Step[] {
  const work = step("work", workMin, zone, p, rpe, { reps, ...(distM ? { distM } : {}) });
  return reps > 1 && recMin > 0 ? [work, step("recover", recMin, "E", p, 2, { reps: reps - 1 })] : [work];
}

const weeklyKm = (c: BuildCtx): number => (c.weeklyMin * 60) / c.paces.E;
const minutesAt = (km: number, paceSKm: number): number => (km * paceSKm) / 60;
/** C1: number of fractions = floor(cap / fraction), at least 2. */
const repsFor = (capMin: number, fracMin: number): number => Math.max(2, Math.floor(capMin / fracMin));

function easyRun(type: "E" | "RECUP" | "L", durMin: number, c: BuildCtx): Step[] {
  if (c.sprints) return sprints(durMin, c);
  const work = step("work", Math.floor(durMin), "E", c.paces, RPE[type]);
  const steps = [type === "RECUP" ? recovery(work) : work];
  if (c.strides) steps.push(step("strides", STRIDES_MIN / 6, "R", c.paces, 3, { reps: 6 }));
  return steps;
}

/** 6 strides of 20 s at the end of a footing. */
export const STRIDES_MIN = 2;

/** P12: the fast finish of a development long run, at marathon pace (McMillan: 10 to 15 min; Runna: progression). */
const FINISH_MIN = 10;
const LONG_FINISH_MIN = 15;
const FINISH_RPE = 5;

/** P12: specific block every other week in the specific phase, semi and marathon only, never in a deload (P9). */
export const longBlock = (c: Pick<BuildCtx, "phase" | "distM" | "progressionStep" | "deload">): boolean =>
  c.distM >= 21097.5 && c.deload !== true && c.phase === "spe" && c.progressionStep % 2 === 0;

function longRun(c: BuildCtx): Step[] {
  const dur = Math.floor(c.durMin ?? 90);
  if (c.distM < 21097.5 || c.deload) return easyRun("L", dur, c);
  // P12: in development, one long run in two finishes at marathon pace (fast finish, McMillan).
  if (c.phase === "dev" && c.progressionStep % 2 === 1) {
    const finish = dur >= 75 ? LONG_FINISH_MIN : FINISH_MIN;
    return [step("work", dur - finish, "E", c.paces, RPE.L), step("work", finish, "M", c.paces, FINISH_RPE)];
  }
  if (!longBlock(c)) return easyRun("L", dur, c);
  const block = Math.floor(dur / 4);
  return [
    step("work", dur - block, "E", c.paces, RPE.L),
    step("work", block, "race", c.paces, RPE.SPE, {
      target: { paceSKm: paceFor("race", c.paces, c.racePaceSKm), rpe: RPE.SPE },
    }),
  ];
}

/**
 * P12: minutes at threshold in one session, +5 per load week of the phase (P17). 20 at least: Daniels' tempo, the
 * low end of McMillan (15 to 40) and Pfitzinger (20 to 40). Above that, continuous or in cruise intervals, Daniels'
 * 10 % of the week's distance: Pfitzinger's 40 (22 + 18) comes with a week big enough for it.
 */
export const T_FLOOR = 20;
const T_MAX = 40;
const thresholdTarget = (c: BuildCtx): number =>
  Math.min(T_MAX, T_FLOOR + 5 * c.progressionStep, Math.max(T_FLOOR, minutesAt(0.1 * weeklyKm(c), c.paces.T)));

function threshold(c: BuildCtx): Step[] {
  return [step("work", Math.floor(thresholdTarget(c)), "T", c.paces, RPE.T)];
}

/** Cruise fractions by load week, so two weeks never repeat (G3); 1 min of rest per 5 min of work (Daniels). */
const CRUISE_FRACTIONS = [5, 8, 10, 6, 12];
/** Half-marathon blocks [km, reps]: 2×3 → 3×4, never one 12 km block (2 to 3 × 3 miles, 2 to 3 min jogged, X2, X3). */
const HALF_PROGRESSION: [number, number][] = [
  [3, 2],
  [4, 3],
];

function cruise(c: BuildCtx): Step[] {
  // Two fractions at least within the session's threshold time (Daniels' 10 %).
  const frac = Math.min(
    CRUISE_FRACTIONS[c.progressionStep % CRUISE_FRACTIONS.length] ?? 5,
    Math.floor(thresholdTarget(c) / 2),
  );
  const reps = Math.max(Math.ceil(T_FLOOR / frac), Math.floor(thresholdTarget(c) / frac));
  return intervals(reps, frac, "T", c.paces, RPE.CRUISE, Math.round(frac / 5));
}

/**
 * Fractions of 3, 4 then 5 min, and again, so the format changes each load week (G3). In the specific phase, 3 min:
 * shorter and faster VO2 work late in the plan (Pfitzinger). 12 min of I at least, Daniels' 8 % of a 30 km week:
 * two fractions of 3 or 4 min are no VO2 session.
 */
export const I_FLOOR = 12;

function interval(c: BuildCtx): Step[] {
  const capMin = minutesAt(Math.min(0.08 * weeklyKm(c), 10), c.paces.I);
  const frac = c.phase === "spe" ? 3 : 3 + (c.progressionStep % 3);
  return intervals(Math.max(repsFor(capMin, frac), Math.ceil(I_FLOOR / frac)), frac, "I", c.paces, RPE.I, frac);
}

function repetition(c: BuildCtx): Step[] {
  const capM = Math.min(0.05 * weeklyKm(c), 8) * 1000;
  const repMin = minutesAt(0.4, c.paces.R);
  return intervals(Math.max(2, Math.floor(capM / 400)), repMin, "R", c.paces, RPE.R, 2 * repMin, 400);
}

function specific(c: BuildCtx): Step[] {
  const race = c.racePaceSKm ?? c.paces.M;
  // P9: a deload keeps the pace, not the volume: the race week's reminder (Runna, McMillan: hard runs cut first).
  if (c.deload) return reminder(c.paces, race);
  const block = (km: number, reps: number): Step[] => {
    const steps = intervals(reps, minutesAt(km, race), "race", c.paces, RPE.SPE, 3, km * 1000);
    for (const s of steps) if (s.kind === "work") s.target.paceSKm = [race, race];
    return steps;
  };
  if (c.distM >= 42195) return block(Math.floor(Math.min(0.2 * weeklyKm(c), 29)), 1);
  const [km, reps] = HALF_PROGRESSION[Math.min(c.progressionStep, HALF_PROGRESSION.length - 1)] ?? [3, 2];
  return block(km, reps);
}

/**
 * Sprint of 10 s with a full recovery (Hudson 2008), on the flat: the neuromuscular stimulus of hill sprints without
 * a hill (Paavolainen 1999). R pace on the watch (C5), the recovery jogged at E.
 */
const SPRINT_MIN = 10 / 60;
const SPRINT_BACK_MIN = 1.5;
const SPRINT_COOLDOWN_MIN = 10;

function sprints(durMin: number, c: BuildCtx): Step[] {
  const reps = Math.min(6 + 2 * c.progressionStep, 10);
  const block = reps * SPRINT_MIN + (reps - 1) * SPRINT_BACK_MIN;
  const warmup = Math.max(10, Math.floor(durMin - block - SPRINT_COOLDOWN_MIN));
  return [
    step("warmup", warmup, "E", c.paces, RPE.E),
    step("strides", SPRINT_MIN, "R", c.paces, 8, { reps }),
    step("recover", SPRINT_BACK_MIN, "E", c.paces, 1, { reps: reps - 1 }),
    step("cooldown", SPRINT_COOLDOWN_MIN, "E", c.paces, RPE.E),
  ];
}

function fartlek(c: BuildCtx): Step[] {
  const fast = Math.min(6 + 2 * c.progressionStep, 20);
  return [
    step("work", Math.max(0, (c.durMin ?? 45) - 2 * fast), "E", c.paces, RPE.E),
    ...intervals(fast, 1, "T", c.paces, 6, 1),
  ];
}

/** TEST (research 02 §7.2: 20 to 30 min all out): 20 min, short enough for a beginner's week, read by F3 on its lap. */
const TEST_MIN = 20;
const TEST_WARMUP_MIN = 10;
const TEST_COOLDOWN_MIN = 5;

/** The pace of a 20 min all-out effort at the VDOT the paces come from (F7 inverted, then F2). */
function testPace(p: Paces): number {
  const level = vo2(60_000 / p.T) / 0.88;
  return 60_000 / speedForVo2(level * fractionF(TEST_MIN));
}

const test = (c: BuildCtx): Step[] => {
  const pace = testPace(c.paces);
  return [
    step("warmup", TEST_WARMUP_MIN, "E", c.paces, RPE.E),
    step("work", TEST_MIN, "race", c.paces, RPE.TEST, { target: { paceSKm: [pace, pace], rpe: RPE.TEST } }),
    step("cooldown", TEST_COOLDOWN_MIN, "E", c.paces, RPE.E),
  ];
};

/** P24: the whole distance at race pace; a distance step ends on the watch where the race does. */
const raceRun = (c: BuildCtx): Step[] => {
  const pace = c.racePaceSKm ?? c.paces.M;
  return [
    step("work", minutesAt(c.distM / 1000, pace), "race", c.paces, RPE.RACE, {
      distM: c.distM,
      target: { paceSKm: [pace, pace], rpe: RPE.RACE },
    }),
  ];
};

const BODIES: Record<RunType, (c: BuildCtx) => Step[]> = {
  E: (c) => easyRun("E", c.durMin ?? 45, c),
  RECUP: (c) => easyRun("RECUP", c.durMin ?? 30, c),
  L: longRun,
  T: threshold,
  CRUISE: cruise,
  I: interval,
  R: repetition,
  SPE: specific,
  FARTLEK: fartlek,
  TEST: test,
  RACE: raceRun,
};

const WRAPPED = new Set<RunType>(["T", "CRUISE", "I", "R", "SPE"]);

/** Catalogue E: 75 min at most (P15). */
export const MAX_E = 75;

/** P15, P12: an easy run is never as long as the week's long run (Runna, Pfitzinger: the long run is the long one). */
export const EASY_TO_LONG = 0.75;

/** 2 × 1 km at race pace, 2 min jog. */
function reminder(p: Paces, racePaceSKm: number): Step[] {
  const body = intervals(2, minutesAt(1, racePaceSKm), "race", p, RPE.SPE, 2, 1000);
  for (const s of body) if (s.kind === "work") s.target.paceSKm = [racePaceSKm, racePaceSKm];
  return body;
}

/** Race week (P18: the taper Q at its fewest fractions, same pace; Pfitzinger): the reminder. */
export const raceReminder = (p: Paces, racePaceSKm: number): Session => quality("SPE", reminder(p, racePaceSKm), p);

/** M3 catalogue, sized by C1. */
export function buildSession(type: RunType, ctx: BuildCtx): Session {
  const body = BODIES[type](ctx);
  return WRAPPED.has(type) ? quality(type, body, ctx.paces) : makeSession(type, body);
}

/** Σ step duration × step RPE (planned load, AU). */
export const sessionLoad = (s: Session): number => s.steps.reduce((sum, st) => sum + stepTotal(st) * st.target.rpe, 0);

const workSteps = (s: Session): Step[] => s.steps.filter((st) => st.kind === "work");
export const workMin = (s: Session): number => workSteps(s).reduce((sum, st) => sum + stepTotal(st), 0);

export function isHard(s: Session): boolean {
  if (s.type === "R") return workSteps(s).reduce((m, st) => m + (st.distM ?? 0) * (st.reps ?? 1), 0) >= 3000;
  if (s.type === "FARTLEK")
    return (
      workSteps(s)
        .filter((st) => st.zone !== "E")
        .reduce((m, st) => m + stepTotal(st), 0) > 6
    );
  return ["L", "T", "CRUISE", "I", "SPE", "TEST", "RACE"].includes(s.type);
}

/** C3, bounded to 1..10. */
export const feelToRpe = (feel: Feel, rpeTarget: number): number =>
  Math.min(10, Math.max(1, rpeTarget + (feel === "easy" ? -2 : feel === "hard" ? 2 : 0)));

/** Rebuilds a Q body, keeping its warm-up, cool-down and identity. */
function withBody(s: Session, type: RunType, body: Step[]): Session {
  const warm = s.steps.filter((st) => st.kind === "warmup");
  const cool = s.steps.filter((st) => st.kind === "cooldown");
  return makeSession(type, [...warm, ...body, ...cool], { ...s, durMin: 0 });
}

const fits = (cand: Session, ref: Session): boolean =>
  cand.durMin <= ref.durMin && sessionLoad(cand) <= sessionLoad(ref);

function intervalEquivalent(s: Session, p: Paces): Session | null {
  const work = workSteps(s)[0];
  if (!work) return null;
  const frac = work.durMin > 3 ? 3 : 4;
  for (let n = Math.floor(stepTotal(work) / frac); n >= 2; n--) {
    const cand = withBody(s, "I", intervals(n, frac, "I", p, RPE.I, frac));
    if (fits(cand, s)) return cand;
  }
  return null;
}

/** T to CRUISE (2 fractions) or CRUISE to continuous T, shrinking time at threshold until duration and load fit. */
function thresholdEquivalent(s: Session, p: Paces): Session | null {
  const tMin = Math.floor(workMin(s));
  for (let t = tMin; t >= 4; t--) {
    const frac = Math.floor(t / 2);
    const body =
      s.type === "T" ? intervals(2, frac, "T", p, RPE.CRUISE, Math.round(frac / 5)) : [step("work", t, "T", p, RPE.T)];
    const cand = withBody(s, s.type === "T" ? "CRUISE" : "T", body);
    if (fits(cand, s)) return cand;
  }
  return null;
}

function specificEquivalent(s: Session, p: Paces): Session | null {
  const work = workSteps(s)[0];
  if (!work) return null;
  const race = work.target.paceSKm?.[0] ?? p.M;
  const reps = 2 * (work.reps ?? 1);
  for (let frac = Math.floor(stepTotal(work) / reps); frac >= 1; frac--) {
    const body = intervals(reps, frac, "race", p, RPE.SPE, 2);
    for (const st of body) if (st.kind === "work") st.target.paceSKm = [race, race];
    const cand = withBody(s, "SPE", body);
    if (fits(cand, s)) return cand;
  }
  return null;
}

/** C2: same family first, one notch down when none fits (I → T, T → FARTLEK). L, easy runs and others: none. */
export function equivalents(s: Session, p: Paces): Session[] {
  const sameFamily =
    s.type === "I"
      ? intervalEquivalent(s, p)
      : s.type === "T" || s.type === "CRUISE"
        ? thresholdEquivalent(s, p)
        : s.type === "SPE"
          ? specificEquivalent(s, p)
          : null;
  if (sameFamily) return [sameFamily];
  if (!["I", "T", "CRUISE"].includes(s.type)) return [];
  const down = downgrade(s, p);
  return fits(down, s) ? [down] : [];
}

/** One notch down at equal work time: I, R → T ; T, CRUISE, SPE, TEST → FARTLEK. */
export function downgrade(s: Session, p: Paces): Session {
  const t = Math.max(1, Math.floor(workMin(s)));
  if (["I", "R"].includes(s.type)) return withBody(s, "T", [step("work", t, "T", p, RPE.T)]);
  return withBody(s, "FARTLEK", intervals(Math.max(2, Math.floor(t / 2)), 1, "T", p, 6, 1));
}

/** C5: a race day has no easy step; its easy range comes from the VDOT its race step implies (F3, F7). */
function raceEasyPace(s: Session): [number, number] | undefined {
  const race = s.steps.find((st) => st.zone === "race" && st.distM);
  return race?.distM ? paceFor("E", paces(vdot(race.distM, race.durMin))) : undefined;
}

/** Easy continuous run replacing `s` at the same moment, never above its RPE (EV3, EV5, EV10, EV11, A4). */
export function toEasy(s: Session, durMin: number, pilot?: Session["pilot"], maxRpe = RPE.E): Session {
  const type = s.type === "RECUP" ? "RECUP" : "E";
  const rpe = Math.min(maxRpe, s.rpeTarget);
  const pace = s.steps.find((st) => st.zone === "E")?.target.paceSKm ?? raceEasyPace(s);
  const work: Step = { kind: "work", durMin, zone: "E", target: { ...(pace ? { paceSKm: pace } : {}), rpe } };
  const easy = makeSession(type, [work], { ...s, durMin: 0 });
  return { ...easy, rpeTarget: rpe, pilot: pilot ?? easy.pilot };
}

/** Scales a session: fractions × f (floor, min 2) or the continuous part × f rounded to `roundTo` min. */
export function scaleSession(s: Session, f: number, roundTo = 1): Session {
  const reps = s.steps.find((st) => st.kind === "work" && (st.reps ?? 1) > 1)?.reps;
  if (reps !== undefined) return withReps(s, Math.floor(reps * f));
  const main = s.steps.reduce((m, st, i) => (st.kind === "work" && st.durMin > (s.steps[m]?.durMin ?? 0) ? i : m), 0);
  // A footing with sprints has no work step: all of it is easy running, so its warm-up takes the whole cut.
  const hasWork = s.steps.some((st) => st.kind === "work");
  const sized = (st: Step): Step => {
    const target = hasWork ? st.durMin * f : st.durMin - (1 - f) * s.durMin;
    const durMin = Math.max(1, Math.min(st.durMin, Math.round(target / roundTo) * roundTo));
    // A distance step ends on the watch at its distance: it shrinks with its time, at the same pace.
    return st.distM
      ? { ...st, durMin, distM: Math.round((st.distM * durMin) / st.durMin / 100) * 100 }
      : { ...st, durMin };
  };
  const steps = s.steps.map((st, i) => (i === main ? sized(st) : st));
  return { ...s, steps, durMin: total(steps) };
}

/** Sets the number of work fractions (at least 2) and the recoveries between them. */
export function withReps(s: Session, reps: number): Session {
  const n = Math.max(2, reps);
  const steps = s.steps.map((st) =>
    st.reps === undefined || st.kind === "strides" ? st : { ...st, reps: st.kind === "work" ? n : n - 1 },
  );
  return { ...s, steps, durMin: total(steps) };
}

/** Same steps, new paces (RC9). "race" blocks keep their own target. */
export function repace(s: Session, p: Paces): Session {
  const steps = s.steps.map((st) => {
    if (!st.zone || st.zone === "race") return st;
    const pace = paceFor(st.zone, p);
    const durMin = st.distM ? minutesAt(st.distM / 1000, pace[0]) : st.durMin;
    const paced = { ...st, durMin, target: { ...st.target, paceSKm: pace } };
    return s.type === "RECUP" ? recovery(paced) : paced;
  });
  return { ...s, steps, durMin: total(steps) };
}
