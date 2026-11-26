import { buildSession, EASY_TO_LONG, longBlock, MAX_E, STRIDES_MIN, scaleSession, taperSession } from "./catalog.ts";
import { addDays, daysBetween, mondayOf, nextMonday } from "./dates.ts";
import { predictTime } from "./fitness.ts";
import { enforceDistribution, longShare, trimTo } from "./guards.ts";
import { recoveryShare } from "./maintenance.ts";
import type { Activity, GoalDistance, Paces, Phase, RunType, Session, Warning } from "./types.ts";

export type Profile = {
  level: "returning" | "regular" | "advanced";
  runsPerWeek: 3 | 4 | 5;
  age?: number;
  /** Injury in the last 6 months, from onboarding (P9). */
  recentInjury?: boolean;
  declaredWeeklyMin?: number;
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
/** P18: weeks from the end, race week included, that come after the last long run. */
const LAST_LONG_WEEKS: Partial<Record<GoalDistance, number>> = { 21097.5: 2, 42195: 3 };
const L_MAX: Record<GoalDistance, number> = { 5000: 90, 10000: 105, 21097.5: 120, 42195: 150 };

export type Split = { base: number; dev: number; spe: number; taper: number; short: boolean };

/** `round` of the spec: nearest, halves up. */
const roundHalfUp = (x: number): number => Math.floor(x + 0.5);

/** P6: a regular runner already has her base (Daniels shortens phase I): two weeks, the fartlek in the second. */
const REGULAR_BASE = 2;

/** P4 to P7. */
export function phaseSplit(
  goal: { distanceM: GoalDistance },
  weeksTotal: number,
  lowBase: boolean,
  regular = false,
): Split {
  const d = goal.distanceM;
  const taper = d === 42195 && weeksTotal < 16 ? 2 : TAPER[d];
  const r = weeksTotal - taper;
  const usual = Math.max(2, roundHalfUp(0.3 * r));
  let base = regular && !lowBase ? Math.min(REGULAR_BASE, usual) : usual;
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

/** P9 for the whole plan; confirmed fatigue turns one built week into a deload instead (week.ts). */
export const cycleFor = (p: Profile): Cycle => ((p.age ?? 0) >= 40 || p.recentInjury === true ? "2:1" : "3:1");

const cycleLength = (c: Cycle): number => (c === "3:1" ? 4 : 3);
const isDeload = (i: number, c: Cycle): boolean => (i + 1) % cycleLength(c) === 0;

export function phaseAt(split: Split, i: number): Phase {
  if (i < split.base) return "base";
  if (i < split.base + split.dev) return "dev";
  if (i < split.base + split.dev + split.spe) return "spe";
  return "taper";
}

/** P18, from the last week backwards. */
export function taperShares(distM: GoalDistance, weeksTotal: number): number[] {
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

export type TemplateSlot = RunType | "E+strides" | "E+sprints";

/**
 * P12: threshold continuous one week, in cruise intervals the next (Daniels, McMillan). In the half's specific
 * phase, the deload's Q2 is a short I (Daniels phase IV keeps T and I; Pfitzinger: shorter VO2 work late), the load
 * weeks keep threshold.
 */
function qualities(phase: Phase, distM: GoalDistance, weekIdx: number, deload: boolean): [RunType, RunType] {
  const threshold: RunType = weekIdx % 2 === 0 ? "T" : "CRUISE";
  if (phase === "dev" || distM === 10000) return weekIdx % 2 === 0 ? ["I", threshold] : [threshold, "I"];
  if (distM === 5000) return ["I", threshold];
  return ["SPE", distM === 21097.5 && phase === "spe" && deload ? "I" : threshold];
}

/**
 * P11 to P13. In base, Q become E + strides and E + sprints on the flat, and a fartlek closes the phase. After the
 * base, one E a week keeps its strides (Daniels, Pfitzinger, Runna: strides all year).
 */
export function weekTemplate(
  phase: Phase,
  runsPerWeek: 3 | 4 | 5,
  distM: GoalDistance,
  weekIdx: number,
  lastOfPhase = false,
  deload = false,
): TemplateSlot[] {
  if (phase === "base") {
    const first: TemplateSlot = lastOfPhase ? "FARTLEK" : runsPerWeek === 3 ? "E+sprints" : "E+strides";
    if (runsPerWeek === 3) return [first, "E+strides", "L"];
    return runsPerWeek === 4 ? [first, "E", "E+sprints", "L"] : [first, "E", "E+sprints", "RECUP", "L"];
  }
  const [q1, q2] = qualities(phase, distM, weekIdx, deload);
  if (runsPerWeek === 3) return [q1, "E+strides", "L"];
  return runsPerWeek === 4 ? [q1, "E+strides", q2, "L"] : [q1, "E+strides", q2, "RECUP", "L"];
}

/**
 * P14. `keepLongest` (a load week): never shorter than her longest run of 30 days, up to Lmax. `spikeRefMin`: G1's
 * reference, her longest of 30 days or what a race of the last 12 weeks leaves of her longest before it.
 */
export function longRunMin(
  runsPerWeek: 3 | 4 | 5,
  weeklyMin: number,
  distM: GoalDistance,
  longest30dMin: number,
  keepLongest = false,
  spikeRefMin = longest30dMin,
): number {
  const pct = longShare(runsPerWeek);
  const lMax = distM === 42195 && weeklyMin >= 300 ? 180 : L_MAX[distM];
  const kept = keepLongest && Number.isFinite(longest30dMin) ? Math.min(longest30dMin, lMax) : 0;
  return Math.max(kept, Math.min(pct * weeklyMin, lMax, 1.1 * spikeRefMin));
}

const QUALITY_SLOTS: TemplateSlot[] = ["T", "CRUISE", "I", "R", "SPE", "FARTLEK", "TEST"];

/**
 * P11: two hard runs a week at most, a long run with a race-pace block counted (Runna: 2 hard runs in 4 to 5; Campus
 * Coach, McMillan). That week the long run is the race-pace session: SPE becomes an easy run with strides, the
 * threshold stays (Pfitzinger: the half's key session).
 */
function atMostTwoHard(template: TemplateSlot[], longHasBlock: boolean): TemplateSlot[] {
  const hard = template.filter((s) => QUALITY_SLOTS.includes(s)).length;
  return longHasBlock && hard >= 2 ? template.map((s) => (s === "SPE" ? "E+strides" : s)) : template;
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

/** Minutes and runs a week. A race counts as a run day (P7) but not as training minutes (P2). */
const weekMinutes = (history: Activity[]): Map<string, { min: number; runs: number }> => {
  const m = new Map<string, { min: number; runs: number }>();
  for (const a of history) {
    const k = mondayOf(a.start);
    const cur = m.get(k) ?? { min: 0, runs: 0 };
    m.set(k, { min: cur.min + (a.isRace === true ? 0 : a.durMin), runs: cur.runs + 1 });
  }
  return m;
};

const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** P2, P7: a race of the last 8 weeks bends the weeks after it (MA6): they are read against the weeks before it. */
const RACE_DAYS = 56;

/** P6: at least 3 runs a week over the 8 weeks before, or before a race of the last 8 weeks (her race block). */
const REGULAR_RUNS = 3;

/** A race is a test of her level, not training volume (P2, P8, P14, G1). */
export const training = (history: Activity[]): Activity[] => history.filter((a) => a.isRace !== true);

/** P2: V0 and whether the base is low (P7). */
export function startingVolume(
  history: Activity[],
  profile: Profile,
  now: string,
): { v0: number; provisional: boolean; runsPerWeek: number; regular: boolean } {
  const runs = training(history);
  const weeks = weekMinutes(history);
  const last = history
    .map((a) => a.start)
    .sort()
    .at(-1);
  const stopped = last !== undefined && daysBetween(last, now) >= 28;
  const anchor = stopped && last ? mondayOf(last) : mondayOf(now);
  const mondays = [1, 2, 3, 4].map((k) => addDays(anchor, -7 * k));
  if (stopped) mondays.unshift(anchor);
  const data = mondays.map((m) => weeks.get(m) ?? { min: 0, runs: 0 });
  const runsPerWeek = mean(data.map((d) => d.runs));
  const ranBefore = (end: string, days: number): number =>
    history.filter((a) => a.start < end && daysBetween(a.start, end) < days).length;
  const regularBefore = (end: string): boolean => ranBefore(end, RACE_DAYS) >= (REGULAR_RUNS * RACE_DAYS) / 7;
  if (data.filter((d) => d.runs > 0).length < 2) {
    return { v0: Math.min(profile.declaredWeeklyMin ?? 150, 150), provisional: true, runsPerWeek, regular: false };
  }
  const recent = data.slice(0, 4).map((d) => d.min);
  const avg = mean(recent);
  const race = stopped
    ? undefined
    : history
        .filter((a) => a.isRace && a.start < now && daysBetween(a.start, now) <= RACE_DAYS)
        .sort((a, b) => a.start.localeCompare(b.start))
        .at(-1);
  if (!race)
    return { v0: stopped ? 0.5 * avg : avg, provisional: false, runsPerWeek, regular: !stopped && regularBefore(now) };
  // The recovery weeks lower the mean: she resumes from her best week since, up to MA6's last easy week.
  const before = (days: number) => runs.filter((a) => a.start < race.start && daysBetween(a.start, race.start) < days);
  const usual = before(RACE_DAYS).reduce((s, a) => s + a.durMin, 0) / (RACE_DAYS / 7);
  return {
    v0: Math.max(avg, Math.min(recoveryShare(race.distM) * usual, Math.max(...recent))),
    provisional: false,
    runsPerWeek: Math.max(runsPerWeek, ranBefore(race.start, 28) / 4),
    regular: regularBefore(now) || regularBefore(race.start),
  };
}

const maxWeekly = (history: Activity[], now: string): number =>
  Math.max(
    0,
    ...[...weekMinutes(training(history).filter((a) => daysBetween(a.start, now) <= 365)).values()].map((w) => w.min),
  );

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
  const split = phaseSplit(goal, sTot, lowBase, start.regular);
  const cycle = cycleFor(profile);
  const loadWeeks = [...Array(split.base + split.dev).keys()].filter((i) => !isDeload(i, cycle)).length;
  const peak = peakVolume(d, start.v0, loadWeeks, maxWeekly(history, now) || start.v0);
  const curve = volumeCurve(split, start.v0, peak.vPeak, cycle, d);
  const warnings: Warning[] = [];
  if (split.short)
    warnings.push({
      ruleId: "P5",
      message: "Ton plan est court pour cette distance : il avance quand même à ton rythme",
    });
  if (peak.warning)
    warnings.push({
      ruleId: "P8",
      message: "Peu de semaines avant ton objectif : ton plan monte moins haut que d'habitude, il reste fait pour toi",
    });
  const first = nextMonday(now);
  const weeks = curve.map((volumeMin, i): PlanWeek => {
    const phase = phaseAt(split, i);
    const phaseStart =
      [0, split.base, split.base + split.dev, split.base + split.dev + split.spe][
        ["base", "dev", "spe", "taper"].indexOf(phase)
      ] ?? 0;
    const loadsBefore = [...Array(i - phaseStart).keys()].filter((k) => !isDeload(phaseStart + k, cycle)).length;
    const lastOfPhase = phaseAt(split, i + 1) !== phase;
    const deload = isDeload(i, cycle);
    const template = atMostTwoHard(
      weekTemplate(phase, profile.runsPerWeek, d, i - phaseStart, lastOfPhase, deload),
      longBlock({ phase, distM: d, progressionStep: loadsBefore, deload }),
    );
    // P18: the last long run at D-14 (half) or D-21 (marathon): the weeks between it and the race week run an E.
    const noLong = i < curve.length - 1 && i >= curve.length - (LAST_LONG_WEEKS[d] ?? 0);
    return {
      index: i,
      monday: addDays(first, 7 * i),
      phase,
      volumeMin,
      deload: phase !== "taper" && deload,
      progressionStep: loadsBefore,
      template: noLong ? template.map((slot) => (slot === "L" ? "E" : slot)) : template,
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

export type WeekCtx = {
  paces: Paces;
  distM: GoalDistance;
  longest30dMin: number;
  /** G1's reference when a race lowered her last 30 days (P14); her longest of 30 days otherwise. */
  spikeRefMin?: number;
  /** Her usual footing: the lower quartile of her runs of 30 days (P15). */
  usualRunMin?: number;
  racePaceSKm?: number;
};

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
    deload: week.deload,
  };
  // A test keeps its length whatever the week (F10).
  const sizeQ = (slot: TemplateSlot, q: Session): Session => {
    if (slot === "TEST") return q;
    if (week.phase === "taper") return taperSession(q, 0.55);
    return week.deload ? scaleSession(q, 2 / 3) : q;
  };
  // P18's last Q at D-4 is H12; its last L at D-14/21 is the plan's template (generatePlan).
  // P9's L × 0.75 is already in a deload week's volume (× 0.75): applying it again would halve the long run.
  const load = !week.deload && week.phase !== "taper";
  const lMin = longRunMin(runsPerWeek, week.volumeMin, ctx.distM, ctx.longest30dMin, load, ctx.spikeRefMin);
  let qCount = 0;
  const fixed = week.template.map((slot, i): Session | null => {
    const id = `${week.monday}-${i}`;
    // A1: for 5 and 10 km, Q1 is placed before L.
    if (slot === "L")
      return { ...buildSession("L", { ...base, durMin: lMin, ...withRace(ctx) }), id, priority: shortRace ? 2 : 1 };
    if (slot === "E" || slot === "RECUP" || slot === "E+strides" || slot === "E+sprints") return null;
    qCount++;
    const priority: Session["priority"] = qCount === 1 ? (shortRace ? 1 : 2) : 3;
    return { ...sizeQ(slot, buildSession(slot, { ...base, ...withRace(ctx) })), id, priority };
  });
  const easySlots = week.template.filter((s) => s === "E" || s === "RECUP" || s === "E+strides" || s === "E+sprints");
  const left = Math.max(0, week.volumeMin - fixed.reduce((sum, s) => sum + (s?.durMin ?? 0), 0));
  const share = easySlots.length ? left / easySlots.length : 0;
  const recup = Math.min(40, Math.max(20, Math.min(share, 0.6 * Math.max(30, share))));
  // P15: E between 30 and 75 min, under 3/4 of the long run unless she already runs her usual footing longer
  // (never past the long run); what is beyond is not run (no medium-long run in the catalogue).
  const usual = Math.min(ctx.usualRunMin ?? 0, lMin);
  const top = week.template.includes("L") ? Math.max(30, EASY_TO_LONG * lMin, usual) : MAX_E;
  const eMin = Math.min(
    MAX_E,
    top,
    Math.max(30, easySlots.includes("RECUP") && easySlots.length > 1 ? (left - recup) / (easySlots.length - 1) : share),
  );
  const sessions = week.template.map(
    (slot, i) => fixed[i] ?? easyFor(slot, { ...base, recup, eMin }, `${week.monday}-${i}`),
  );
  const spread = enforceDistribution(sessions, week.phase).week;
  // P18: the taper's share of the peak is a ceiling (Bosquet 2007), Q included, not a floor the easy runs top up.
  if (week.phase === "taper") return trimTo(spread, week.volumeMin, "P18").week;
  // P9: so is a deload's volume; a race-pace block sized on distance must not make it a load week in disguise.
  return week.deload ? trimTo(spread, week.volumeMin, "P9").week : spread;
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
  // The strides (6 × 20 s) fit inside the run's share of the week, under the catalogue's 75 min.
  const ctx = {
    ...c,
    durMin: slot === "RECUP" ? c.recup : slot === "E+strides" ? Math.min(c.eMin, MAX_E) - STRIDES_MIN : c.eMin,
  };
  if (slot === "RECUP") return { ...buildSession("RECUP", ctx), id };
  if (slot === "E+sprints") return { ...buildSession("E", { ...ctx, sprints: true }), id };
  return { ...buildSession("E", { ...ctx, strides: slot === "E+strides" }), id };
}
