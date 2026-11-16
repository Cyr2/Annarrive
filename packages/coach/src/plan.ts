import { buildSession, scaleSession } from "./catalog.ts";
import { addDays, daysBetween, mondayOf, nextMonday } from "./dates.ts";
import { predictTime } from "./fitness.ts";
import { enforceDistribution } from "./guards.ts";
import type { Activity, GoalDistance, Paces, Phase, RunType, Session, Warning } from "./types.ts";

export type Profile = {
  level: "returning" | "regular" | "advanced";
  runsPerWeek: 3 | 4 | 5;
  age?: number;
  /** Injury in the last 6 months, from onboarding (P9). */
  recentInjury?: boolean;
  /** Days of confirmed fatigue (M5) in the previous week (P9). */
  fatigueDaysLastWeek?: number;
  declaredWeeklyMin?: number;
  /** Mondays of weeks lost to illness, left out of V0 (P2). */
  sickWeeks?: string[];
  /** VDOT still provisional (P20): the class is shown as uncertain. */
  provisional?: boolean;
};

export type FeasibilityClass = "conservateur" | "réaliste" | "ambitieux" | "irréaliste" | "sans-cible";
export type Feasibility = { gain: number; gainMax: number; class: FeasibilityClass; uncertain: boolean };

const RATE: Record<Profile["level"], [number, number]> = {
  returning: [0.006, 0.12],
  regular: [0.0035, 0.07],
  advanced: [0.0015, 0.03],
};

/** P19, P20: classifies Anna's target; no time is ever proposed. `weeks` = S_tot - S_aff. */
export function feasibility(
  p0Min: number,
  targetMin: number | undefined,
  weeks: number,
  profile: Profile,
): Feasibility {
  const [r, cap] = RATE[profile.level];
  const gainMax = Math.min(r * weeks, cap);
  const uncertain = profile.provisional ?? false;
  if (targetMin === undefined) return { gain: 0, gainMax, class: "sans-cible", uncertain };
  const gain = (p0Min - targetMin) / p0Min;
  const cls: FeasibilityClass =
    gain <= 0.5 * gainMax
      ? "conservateur"
      : gain <= gainMax
        ? "réaliste"
        : gain <= 1.5 * gainMax
          ? "ambitieux"
          : "irréaliste";
  return { gain, gainMax, class: cls, uncertain };
}

/** P3: complete weeks from the next Monday to the race Sunday included. */
export const totalWeeks = (now: string, raceDate: string): number =>
  Math.floor((daysBetween(nextMonday(now), raceDate) + 1) / 7);

const TAPER: Record<GoalDistance, number> = { 5000: 1, 10000: 1, 21097.5: 2, 42195: 3 };
const MIN_WEEKS: Record<GoalDistance, number> = { 5000: 6, 10000: 8, 21097.5: 10, 42195: 12 };
const PEAK: Record<GoalDistance, [number, number]> = {
  5000: [120, 240],
  10000: [150, 280],
  21097.5: [180, 330],
  42195: [240, 450],
};
const L_MAX: Record<GoalDistance, number> = { 5000: 90, 10000: 105, 21097.5: 120, 42195: 150 };

export type Split = { base: number; dev: number; spe: number; taper: number; short: boolean };

/** `round` of the spec: nearest, halves up. */
const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

/** P4 to P7. */
export function phaseSplit(goal: { distanceM: GoalDistance }, weeksTotal: number, lowBase: boolean): Split {
  const d = goal.distanceM;
  const taper = d === 42195 && weeksTotal < 16 ? 2 : TAPER[d];
  const r = weeksTotal - taper;
  let base = Math.max(2, roundHalfUp(0.3 * r));
  let spe = Math.max(d === 42195 ? 4 : 3, roundHalfUp(0.35 * r));
  let dev = r - base - spe;
  if (dev < 0) {
    dev = 0;
    base = Math.max(1, Math.min(base, r - spe));
    spe = r - base;
  }
  if (lowBase) {
    const add = Math.min(8, dev);
    base += add;
    dev -= add;
  }
  return { base, dev, spe, taper, short: weeksTotal < MIN_WEEKS[d] };
}

/** P8. */
export function peakVolume(
  distM: GoalDistance,
  v0: number,
  loadWeeks: number,
  max12m: number,
): { vPeak: number; warning?: "peak_below_min" } {
  const [low, high] = PEAK[distM];
  const vPeak = Math.min(high, v0 * 1.1 ** loadWeeks, 1.2 * max12m);
  return vPeak < low ? { vPeak, warning: "peak_below_min" } : { vPeak };
}

export type Cycle = "3:1" | "2:1";

/** P9. */
export const cycleFor = (p: Profile): Cycle =>
  (p.age ?? 0) >= 40 || p.recentInjury === true || (p.fatigueDaysLastWeek ?? 0) >= 3 ? "2:1" : "3:1";

const cycleLength = (c: Cycle): number => (c === "3:1" ? 4 : 3);
const isDeload = (i: number, c: Cycle): boolean => (i + 1) % cycleLength(c) === 0;

export function phaseAt(split: Split, i: number): Phase {
  if (i < split.base) return "base";
  if (i < split.base + split.dev) return "dev";
  if (i < split.base + split.dev + split.spe) return "spe";
  return "taper";
}

/** P18, from the last week backwards. */
function taperShares(distM: GoalDistance, weeksTotal: number): number[] {
  if (distM === 5000) return [0.5];
  if (distM === 10000) return weeksTotal >= 14 ? [0.7, 0.5] : [0.5];
  if (distM === 21097.5) return [0.7, 0.5];
  return [0.8, 0.62, 0.45];
}

/** P9, P10, P18: weekly minutes. */
export function volumeCurve(split: Split, v0: number, vPeak: number, cycle: Cycle, distM: GoalDistance): number[] {
  const n = split.base + split.dev + split.spe + split.taper;
  const out: number[] = [];
  let lastLoad = v0;
  let prev = v0;
  for (let i = 0; i < n; i++) {
    const phase = phaseAt(split, i);
    let v: number;
    if (isDeload(i, cycle)) v = 0.75 * prev;
    else {
      v = phase === "base" || phase === "dev" ? Math.min(vPeak, 1.1 * lastLoad) : vPeak;
      lastLoad = v;
    }
    out.push(v);
    prev = v;
  }
  const shares = taperShares(distM, n);
  shares.forEach((share, k) => {
    const i = n - shares.length + k;
    if (i >= 0) out[i] = share * vPeak;
  });
  return out;
}

export type TemplateSlot = RunType | "E+strides" | "E+COTES_C";

function qualities(phase: Phase, distM: GoalDistance, weekIdx: number): [RunType, RunType] {
  const alternate: [RunType, RunType] = weekIdx % 2 === 0 ? ["I", "T"] : ["T", "I"];
  if (phase === "dev" || distM === 10000) return alternate;
  if (distM === 5000) return ["I", "T"];
  return ["SPE", "T"];
}

/** P11 to P13. In base, Q become E + strides and E + short hills, and a fartlek closes the phase. */
export function weekTemplate(
  phase: Phase,
  runsPerWeek: 3 | 4 | 5,
  distM: GoalDistance,
  weekIdx: number,
  lastOfPhase = false,
): TemplateSlot[] {
  if (phase === "base") {
    const first: TemplateSlot = lastOfPhase ? "FARTLEK" : runsPerWeek === 3 ? "E+COTES_C" : "E+strides";
    if (runsPerWeek === 3) return [first, "E+strides", "L"];
    return runsPerWeek === 4 ? [first, "E", "E+COTES_C", "L"] : [first, "E", "E+COTES_C", "RECUP", "L"];
  }
  const [q1, q2] = qualities(phase, distM, weekIdx);
  if (runsPerWeek === 3) return [q1, "E+strides", "L"];
  return runsPerWeek === 4 ? [q1, "E", q2, "L"] : [q1, "E", q2, "RECUP", "L"];
}

/** P14. */
export function longRunMin(
  runsPerWeek: 3 | 4 | 5,
  weeklyMin: number,
  distM: GoalDistance,
  longest30dMin: number,
): number {
  const pct = { 3: 0.4, 4: 0.35, 5: 0.3 }[runsPerWeek];
  const lMax = distM === 42195 && weeklyMin >= 300 ? 180 : L_MAX[distM];
  return Math.min(pct * weeklyMin, lMax, 1.1 * longest30dMin);
}

export type PlanWeek = {
  index: number;
  monday: string;
  phase: Phase;
  volumeMin: number;
  deload: boolean;
  progressionStep: number;
  template: TemplateSlot[];
};

export type Plan = {
  goal: { distanceM: GoalDistance; date: string; targetMin?: number };
  v0: number;
  provisional: boolean;
  vPeak: number;
  split: Split;
  cycle: Cycle;
  feasibility: Feasibility;
  weeks: PlanWeek[];
  warnings: Warning[];
};

const weekMinutes = (history: Activity[]): Map<string, { min: number; runs: number }> => {
  const m = new Map<string, { min: number; runs: number }>();
  for (const a of history) {
    const k = mondayOf(a.start);
    const cur = m.get(k) ?? { min: 0, runs: 0 };
    m.set(k, { min: cur.min + a.durMin, runs: cur.runs + 1 });
  }
  return m;
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** P2: V0 and whether the base is low (P7). */
export function startingVolume(
  history: Activity[],
  profile: Profile,
  now: string,
): { v0: number; provisional: boolean; runsPerWeek: number } {
  const weeks = weekMinutes(history);
  const last = history
    .map((a) => a.start)
    .sort()
    .at(-1);
  const stopped = last !== undefined && daysBetween(last, now) >= 28;
  const anchor = stopped && last ? mondayOf(last) : mondayOf(now);
  const mondays = [1, 2, 3, 4].map((k) => addDays(anchor, -7 * k)).filter((m) => !profile.sickWeeks?.includes(m));
  if (stopped) mondays.unshift(anchor);
  const data = mondays.map((m) => weeks.get(m) ?? { min: 0, runs: 0 });
  const runsPerWeek = mean(data.map((d) => d.runs));
  if (data.filter((d) => d.runs > 0).length < 2) {
    return { v0: Math.min(profile.declaredWeeklyMin ?? 150, 150), provisional: true, runsPerWeek };
  }
  const avg = mean(data.slice(0, 4).map((d) => d.min));
  return { v0: stopped ? 0.5 * avg : avg, provisional: false, runsPerWeek };
}

const maxWeekly = (history: Activity[], now: string): number =>
  Math.max(0, ...[...weekMinutes(history.filter((a) => daysBetween(a.start, now) <= 365)).values()].map((w) => w.min));

/** M2: from goal, profile, history and fitness to a periodised plan starting next Monday. */
export function generatePlan(
  goal: { distanceM: GoalDistance; date: string; targetMin?: number },
  profile: Profile,
  history: Activity[],
  fitness: { vdot: number; provisional?: boolean },
  now: string,
): Plan {
  const d = goal.distanceM;
  const start = startingVolume(history, profile, now);
  const sTot = totalWeeks(now, goal.date);
  const lowBase = start.v0 < 0.5 * PEAK[d][0] || start.runsPerWeek < 3;
  const split = phaseSplit(goal, sTot, lowBase);
  const cycle = cycleFor(profile);
  const loadWeeks = [...Array(split.base + split.dev).keys()].filter((i) => !isDeload(i, cycle)).length;
  const peak = peakVolume(d, start.v0, loadWeeks, maxWeekly(history, now) || start.v0);
  const curve = volumeCurve(split, start.v0, peak.vPeak, cycle, d);
  const warnings: Warning[] = [];
  if (split.short) warnings.push({ ruleId: "P5", message: "Plan court pour cette distance" });
  if (peak.warning) warnings.push({ ruleId: "P8", message: "Volume de pointe sous le minimum conseillé" });
  const first = nextMonday(now);
  const weeks = curve.map((volumeMin, i): PlanWeek => {
    const phase = phaseAt(split, i);
    const phaseStart =
      [0, split.base, split.base + split.dev, split.base + split.dev + split.spe][
        ["base", "dev", "spe", "taper"].indexOf(phase)
      ] ?? 0;
    const loadsBefore = [...Array(i - phaseStart).keys()].filter((k) => !isDeload(phaseStart + k, cycle)).length;
    const lastOfPhase = phaseAt(split, i + 1) !== phase;
    return {
      index: i,
      monday: addDays(first, 7 * i),
      phase,
      volumeMin,
      deload: phase !== "taper" && isDeload(i, cycle),
      progressionStep: loadsBefore,
      template: weekTemplate(phase, profile.runsPerWeek, d, i - phaseStart, lastOfPhase),
    };
  });
  const p0 = predictTime(fitness.vdot, d);
  return {
    goal,
    v0: start.v0,
    provisional: start.provisional,
    vPeak: peak.vPeak,
    split,
    cycle,
    feasibility: feasibility(p0, goal.targetMin, sTot - split.taper, {
      ...profile,
      provisional: profile.provisional === true || fitness.provisional === true,
    }),
    weeks,
    warnings,
  };
}

/** P22: two weeks under 80 % of plan → no rise next week, and the rest of the build shifts by one week (Dev compressed). */
export function replanFromActual(plan: Plan, actualWeeks: number[]): Plan {
  const k = actualWeeks.length;
  const under = (i: number): boolean => (actualWeeks[i] ?? 0) < 0.8 * (plan.weeks[i]?.volumeMin ?? 0);
  if (k < 2 || !under(k - 1) || !under(k - 2)) return plan;
  const taperStart = plan.weeks.length - plan.split.taper;
  const weeks = plan.weeks.map((w, i) =>
    i >= k && i < taperStart ? { ...w, volumeMin: plan.weeks[i - 1]?.volumeMin ?? w.volumeMin } : w,
  );
  return { ...plan, weeks };
}

export type WeekCtx = { paces: Paces; distM: GoalDistance; longest30dMin: number; racePaceSKm?: number };

/**
 * buildWeek (§0.1): sizes the sessions of a plan week, unplaced. L and Q first, the rest of the volume in E (≥ 30 min)
 * and RECUP (20 to 40 min, ≤ 0.6 × E). Deload: Q fractions × 2/3, L × 0.75 (P9). Taper: fractions × 0.55 (P18).
 */
export function buildWeek(week: PlanWeek, ctx: WeekCtx): Session[] {
  const runs = week.template.length;
  const runsPerWeek = runs === 3 || runs === 4 ? runs : 5;
  const shortRace = ctx.distM <= 10000;
  const base = {
    weeklyMin: week.volumeMin,
    paces: ctx.paces,
    phase: week.phase,
    progressionStep: week.progressionStep,
    distM: ctx.distM,
  };
  const qFactor = week.phase === "taper" ? 0.55 : week.deload ? 2 / 3 : 1;
  // shortcut: P18 "last Q at D-4, last L at D-14/21" is not enforced here; the taper volume already shrinks them.
  const lMin = longRunMin(runsPerWeek, week.volumeMin, ctx.distM, ctx.longest30dMin) * (week.deload ? 0.75 : 1);
  let qCount = 0;
  const fixed = week.template.map((slot, i): Session | null => {
    const id = `${week.monday}-${i}`;
    // A1: for 5 and 10 km, Q1 is placed before L.
    if (slot === "L")
      return { ...buildSession("L", { ...base, durMin: lMin, ...withRace(ctx) }), id, priority: shortRace ? 2 : 1 };
    if (slot === "E" || slot === "RECUP" || slot === "E+strides" || slot === "E+COTES_C") return null;
    qCount++;
    const priority: Session["priority"] = qCount === 1 ? (shortRace ? 1 : 2) : 3;
    const q = buildSession(slot, { ...base, ...withRace(ctx) });
    return { ...(qFactor < 1 ? scaleSession(q, qFactor) : q), id, priority };
  });
  const easySlots = week.template.filter((s) => s === "E" || s === "RECUP" || s === "E+strides" || s === "E+COTES_C");
  const left = Math.max(0, week.volumeMin - fixed.reduce((sum, s) => sum + (s?.durMin ?? 0), 0));
  const share = easySlots.length ? left / easySlots.length : 0;
  const recup = Math.min(40, Math.max(20, Math.min(share, 0.6 * Math.max(30, share))));
  const eMin = Math.max(
    30,
    easySlots.includes("RECUP") && easySlots.length > 1 ? (left - recup) / (easySlots.length - 1) : share,
  );
  const sessions = week.template.map(
    (slot, i) => fixed[i] ?? easyFor(slot, { ...base, recup, eMin }, `${week.monday}-${i}`),
  );
  return enforceDistribution(sessions, week.phase).week;
}

const withRace = (ctx: WeekCtx): { racePaceSKm?: number } => (ctx.racePaceSKm ? { racePaceSKm: ctx.racePaceSKm } : {});

function easyFor(
  slot: TemplateSlot,
  c: {
    weeklyMin: number;
    paces: Paces;
    phase: Phase;
    progressionStep: number;
    distM: number;
    recup: number;
    eMin: number;
  },
  id: string,
): Session {
  const ctx = { ...c, durMin: slot === "RECUP" ? c.recup : c.eMin };
  if (slot === "RECUP") return { ...buildSession("RECUP", ctx), id };
  if (slot === "E+COTES_C") return { ...buildSession("COTES_C", ctx), id };
  return { ...buildSession("E", { ...ctx, strides: slot === "E+strides" }), id };
}
