import { pilotFor } from "./fitness.ts";
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
  COTES_C: 3,
  COTES_L: 8,
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
  COTES_L: 2,
  TEST: 2,
  RACE: 1,
  FARTLEK: 3,
  E: 4,
  COTES_C: 4,
  RECUP: 5,
};

export type BuildCtx = {
  weeklyMin: number;
  paces: Paces;
  phase: Phase;
  progressionStep: number;
  distM: number;
  /** Length of continuous runs (E, RECUP, L, COTES_C, FARTLEK). */
  durMin?: number;
  strides?: boolean;
  /** Race-pace target for SPE (P21); defaults to M. */
  racePaceSKm?: number;
};

export const stepTotal = (s: Step): number => s.durMin * (s.reps ?? 1);
const total = (steps: Step[]): number => steps.reduce((sum, s) => sum + stepTotal(s), 0);

export function paceFor(zone: PaceZone, p: Paces, race?: number): [number, number] {
  if (zone === "E") return p.E;
  const v = zone === "race" ? (race ?? p.M) : p[zone];
  return [v, v];
}

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

const weeklyKm = (c: BuildCtx): number => (c.weeklyMin * 60) / ((c.paces.E[0] + c.paces.E[1]) / 2);
const minutesAt = (km: number, paceSKm: number): number => (km * paceSKm) / 60;
/** C1: number of fractions = floor(cap / fraction), at least 2. */
const repsFor = (capMin: number, fracMin: number): number => Math.max(2, Math.floor(capMin / fracMin));

function easyRun(type: "E" | "RECUP" | "L", durMin: number, c: BuildCtx): Step[] {
  const steps = [step("work", Math.floor(durMin), "E", c.paces, RPE[type])];
  if (c.strides) steps.push(step("strides", 1 / 3, "R", c.paces, 3, { reps: 6 }));
  return steps;
}

function longRun(c: BuildCtx): Step[] {
  const dur = Math.floor(c.durMin ?? 90);
  // P12: specific block every other week in the specific phase, semi and marathon only.
  if (c.phase !== "spe" || c.distM < 21097.5 || c.progressionStep % 2 === 1) return easyRun("L", dur, c);
  const block = Math.floor(dur / 4);
  return [
    step("work", dur - block, "E", c.paces, RPE.L),
    step("work", block, "race", c.paces, RPE.SPE, {
      target: { paceSKm: paceFor("race", c.paces, c.racePaceSKm), rpe: RPE.SPE },
    }),
  ];
}

function threshold(c: BuildCtx): Step[] {
  const capMin = minutesAt(0.1 * weeklyKm(c), c.paces.T);
  return [step("work", Math.floor(Math.min(capMin, 15 + 5 * c.progressionStep, 20)), "T", c.paces, RPE.T)];
}

/** [reps, minutes]: 3×5 → 3×10 → 2×15. */
const CRUISE_PROGRESSION: [number, number][] = [
  [3, 5],
  [3, 10],
  [2, 15],
];
/** Half-marathon blocks [km, reps]: 2×3 → 3×4 → 12 km. */
const HALF_PROGRESSION: [number, number][] = [
  [3, 2],
  [4, 3],
  [12, 1],
];

function cruise(c: BuildCtx): Step[] {
  const capMin = minutesAt(0.1 * weeklyKm(c), c.paces.T);
  const [reps, frac] = CRUISE_PROGRESSION[Math.min(c.progressionStep, 2)] ?? [3, 5];
  return intervals(Math.min(reps, repsFor(capMin, frac)), frac, "T", c.paces, RPE.CRUISE, Math.round(frac / 5));
}

function interval(c: BuildCtx): Step[] {
  const capMin = minutesAt(Math.min(0.08 * weeklyKm(c), 10), c.paces.I);
  const frac = 3 + Math.min(c.progressionStep, 2);
  return intervals(repsFor(capMin, frac), frac, "I", c.paces, RPE.I, frac);
}

function repetition(c: BuildCtx): Step[] {
  const capM = Math.min(0.05 * weeklyKm(c), 8) * 1000;
  const repMin = minutesAt(0.4, c.paces.R);
  return intervals(Math.max(2, Math.floor(capM / 400)), repMin, "R", c.paces, RPE.R, 2 * repMin, 400);
}

function specific(c: BuildCtx): Step[] {
  const race = c.racePaceSKm ?? c.paces.M;
  const block = (km: number, reps: number): Step[] => {
    const steps = intervals(reps, minutesAt(km, race), "race", c.paces, RPE.SPE, 3, km * 1000);
    for (const s of steps) if (s.kind === "work") s.target.paceSKm = [race, race];
    return steps;
  };
  if (c.distM >= 42195) return block(Math.floor(Math.min(0.2 * weeklyKm(c), 29)), 1);
  const [km, reps] = HALF_PROGRESSION[Math.min(c.progressionStep, 2)] ?? [3, 2];
  return block(km, reps);
}

function hillsShort(c: BuildCtx): Step[] {
  const reps = Math.min(6 + 2 * c.progressionStep, 10);
  const hills = step("strides", 1 / 6, "R", c.paces, 3, { reps });
  return [step("work", Math.floor((c.durMin ?? 45) - reps / 6), "E", c.paces, RPE.E), hills];
}

function hillsLong(c: BuildCtx): Step[] {
  const capMin = minutesAt(Math.min(0.08 * weeklyKm(c), 10), c.paces.I);
  return intervals(Math.min(6 + c.progressionStep, 10, repsFor(capMin, 1.5)), 1.5, "I", c.paces, RPE.COTES_L, 1.5);
}

function fartlek(c: BuildCtx): Step[] {
  const fast = Math.min(6 + 2 * c.progressionStep, 20);
  return [
    step("work", Math.max(0, (c.durMin ?? 45) - 2 * fast), "E", c.paces, RPE.E),
    ...intervals(fast, 1, "T", c.paces, 6, 1),
  ];
}

const test = (c: BuildCtx): Step[] => [step("work", minutesAt(5, c.paces.I), "I", c.paces, RPE.TEST, { distM: 5000 })];

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
  COTES_C: hillsShort,
  COTES_L: hillsLong,
  FARTLEK: fartlek,
  TEST: test,
  RACE: raceRun,
};

const WRAPPED = new Set<RunType>(["T", "CRUISE", "I", "R", "SPE", "COTES_L", "TEST"]);

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
  return ["L", "T", "CRUISE", "I", "SPE", "COTES_L", "TEST", "RACE"].includes(s.type);
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

/** One notch down at equal work time: I, R, COTES_L → T ; T, CRUISE, SPE, TEST → FARTLEK. */
export function downgrade(s: Session, p: Paces): Session {
  const t = Math.max(1, Math.floor(workMin(s)));
  if (["I", "R", "COTES_L"].includes(s.type)) return withBody(s, "T", [step("work", t, "T", p, RPE.T)]);
  return withBody(s, "FARTLEK", intervals(Math.max(2, Math.floor(t / 2)), 1, "T", p, 6, 1));
}

/** Easy continuous run replacing `s` at the same moment, never above its RPE (EV3, EV5, EV10, EV11, A4). */
export function toEasy(s: Session, durMin: number, pilot?: Session["pilot"], maxRpe = RPE.E): Session {
  const type = s.type === "RECUP" ? "RECUP" : "E";
  const rpe = Math.min(maxRpe, s.rpeTarget);
  const pace = s.steps.find((st) => st.zone === "E")?.target.paceSKm;
  const work: Step = { kind: "work", durMin, zone: "E", target: { ...(pace ? { paceSKm: pace } : {}), rpe } };
  const easy = makeSession(type, [work], { ...s, durMin: 0 });
  return { ...easy, rpeTarget: rpe, pilot: pilot ?? easy.pilot };
}

/** Scales a session: fractions × f (floor, min 2) or the continuous part × f rounded to `roundTo` min. */
export function scaleSession(s: Session, f: number, roundTo = 1): Session {
  const reps = s.steps.find((st) => st.kind === "work" && (st.reps ?? 1) > 1)?.reps;
  if (reps !== undefined) return withReps(s, Math.floor(reps * f));
  const main = s.steps.reduce((m, st, i) => (st.kind === "work" && st.durMin > (s.steps[m]?.durMin ?? 0) ? i : m), 0);
  const steps = s.steps.map((st, i) =>
    i === main
      ? { ...st, durMin: Math.max(1, Math.min(st.durMin, Math.round((st.durMin * f) / roundTo) * roundTo)) }
      : st,
  );
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
    return { ...st, durMin, target: { ...st.target, paceSKm: pace } };
  });
  return { ...s, steps, durMin: total(steps) };
}
