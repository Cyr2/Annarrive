import {
  EASY_TO_LONG,
  isHard,
  MAX_E,
  sessionLoad,
  stepTotal,
  T_FLOOR,
  toEasy,
  withReps,
  withSteps,
} from "./catalog.ts";
import { checkHard, slotOf } from "./placement.ts";
import type { Change, Phase, Session, Step, WeekState } from "./types.ts";

const SPIKE = 1.1;
const WEEK_RISE = 1.1;
const FORTNIGHT_RISE = 1.3;
const MIN_EASY = 20;
/** Catalogue E (P15): 30 min at least while the week allows it. */
const MIN_E = 30;
const CHRONIC_WEEKS = 4;
const LIGHT = 0.8;

const totalMin = (week: Session[]): number => week.reduce((sum, s) => sum + s.durMin, 0);
/** Sprints with full recoveries are not one block to shorten: they keep the catalogue E floor (P15). */
const isContinuous = (s: Session): boolean =>
  (s.type === "E" || s.type === "RECUP" || s.type === "L") && s.steps.some((st) => st.kind === "work");

/** Sets the duration of a run by resizing its main step; a distance step keeps its pace (the watch ends on distance). */
function resize(s: Session, durMin: number): Session {
  const delta = durMin - s.durMin;
  // The longest work step; a footing with sprints has none and its warm-up takes the change.
  const main = s.steps.reduce(
    (best, st, i) => (st.kind === "work" && st.durMin > (s.steps[best]?.durMin ?? 0) ? i : best),
    Math.max(
      0,
      s.steps.findIndex((st) => st.kind === "work"),
    ),
  );
  const sized = (st: Step): Step => {
    const dur = Math.max(1, st.durMin + delta / (st.reps ?? 1));
    return st.distM
      ? { ...st, durMin: dur, distM: Math.round((st.distM * dur) / st.durMin / 100) * 100 }
      : { ...st, durMin: dur };
  };
  const steps = s.steps.map((st, i) => (i === main ? sized(st) : st));
  return withSteps(s, steps);
}

const plannedKm = (s: Session): number =>
  s.steps.reduce((km, st) => {
    const pace = st.target.paceSKm;
    return pace ? km + (stepTotal(st) * 60) / ((pace[0] + pace[1]) / 2) : km;
  }, 0);

/** G1: duration ≤ 1.10 × longest run of 30 days, and planned distance ≤ 1.10 × longest distance when known. */
export function spikeCap(
  s: Session,
  longest30dMin: number,
  longest30dM?: number,
): { session: Session; surplusMin: number } {
  let cap = SPIKE * longest30dMin;
  const km = plannedKm(s);
  if (longest30dM !== undefined && km > 0) cap = Math.min(cap, (s.durMin * SPIKE * longest30dM) / 1000 / km);
  if (s.durMin <= cap) return { session: s, surplusMin: 0 };
  const capped = resize(s, Math.floor(cap));
  return { session: capped, surplusMin: s.durMin - capped.durMin };
}

/** G1 over a week: the surplus goes to an E that stays under the cap, else it is lost. */
export function capWeekSpikes(
  week: Session[],
  longest30dMin: number,
  longest30dM?: number,
): { week: Session[]; changes: Change[] } {
  let out = week;
  const changes: Change[] = [];
  for (const s of week) {
    const { session, surplusMin } = spikeCap(s, longest30dMin, longest30dM);
    if (surplusMin === 0) continue;
    out = out.map((x) => (x.id === s.id ? session : x));
    changes.push({ ruleId: "G1", sessionId: s.id, before: s, after: session, detail: `surplus ${surplusMin} min` });
    const easy = out.find((x) => x.type === "E" && x.durMin + surplusMin <= Math.min(SPIKE * longest30dMin, MAX_E));
    if (!easy) continue;
    const grown = resize(easy, easy.durMin + surplusMin);
    out = out.map((x) => (x.id === easy.id ? grown : x));
    changes.push({ ruleId: "G1", sessionId: easy.id, before: easy, after: grown, detail: "surplus moved" });
  }
  return { week: out, changes };
}

/** P14: the long run's share of the week, by runs per week. */
/** P14: the upper end of the reference plans (38 to 40 % of the week), lower with more runs to share it. */
export const longShare = (runs: number): number => (runs <= 3 ? 0.4 : runs === 4 ? 0.38 : 0.35);

const isEasy = (s: Session): boolean => s.type === "E" || s.type === "RECUP";
const isQ = (s: Session): boolean => s.type !== "L" && s.type !== "RACE" && s.type !== "TEST" && !isEasy(s);
/** Catalogue floors (P15): RECUP 20 min, E 30 min. */
const easyFloor = (s: Session): number => (s.type === "RECUP" ? MIN_EASY : MIN_E);

/** Warm-up and cool-down keep 10 and 5 min, as around a test (catalogue TEST). */
const MIN_AROUND: Partial<Record<Step["kind"], number>> = { warmup: 10, cooldown: 5 };

/**
 * A Q shortened by `excess` minutes, never below 2/3 of itself (P9's cut): fractions first, else its warm-up and
 * cool-down down to 10 and 5 min, then a continuous block by a third at most, a threshold block never under its 20 min
 * (P16: the next Q gives instead). Two fractions stay whole minutes.
 */
function shortenQ(s: Session, excess: number): Session {
  const target = Math.floor(Math.max((2 / 3) * s.durMin, s.durMin - excess));
  const reps = s.steps.find((st) => st.kind === "work")?.reps ?? 1;
  if (reps > 2) {
    let out = s;
    for (let n = reps - 1; n >= 2 && out.durMin > target; n--) out = withReps(s, n);
    return out;
  }
  let left = s.durMin - target;
  const steps = s.steps.map((st) => {
    const floor = MIN_AROUND[st.kind];
    if (floor === undefined) return st;
    const cut = Math.max(0, Math.min(left, st.durMin - floor));
    left -= cut;
    return { ...st, durMin: st.durMin - cut };
  });
  const warmed = withSteps(s, steps);
  if (reps > 1 || warmed.durMin <= target) return warmed;
  const work = steps.filter((st) => st.kind === "work").reduce((sum, st) => sum + stepTotal(st), 0);
  const cut = Math.min(work / 3, isThreshold(s) ? Math.max(0, work - T_FLOOR) : work);
  return resize(warmed, Math.max(target, Math.ceil(warmed.durMin - cut)));
}

/** G2b's first step alone: easy runs, lowest priority first, down to the catalogue's floors (P15) until `cap` holds. */
export function trimEasy(week: Session[], cap: number, ruleId: string): { week: Session[]; changes: Change[] } {
  let out = week;
  const changes: Change[] = [];
  const lowestFirst = out.filter(isEasy).sort((a, b) => b.priority - a.priority || b.durMin - a.durMin);
  for (const s of lowestFirst) {
    const excess = totalMin(out) - cap;
    if (excess <= 0) break;
    const after = resize(s, Math.max(easyFloor(s), s.durMin - excess));
    if (after.durMin >= s.durMin) continue;
    out = out.map((x) => (x.id === s.id ? after : x));
    changes.push({ ruleId, sessionId: s.id, before: s, after });
  }
  return { week: out, changes };
}

/**
 * Shortens the week until it fits `cap` minutes, in the order the research keeps sessions (02 §4.2, 03 §8.1):
 * easy runs down to the catalogue's 30 min (P15), then each Q by a third (P9's cut), then the long run down to its
 * share of the capped week (P14), never under `keepLongMin`. Only then, when a hard cap still binds, easy runs and the
 * long run go to 20 min.
 */
export function trimTo(
  week: Session[],
  cap: number,
  ruleId: string,
  keepLongMin = 0,
): { week: Session[]; changes: Change[] } {
  const easy = trimEasy(week, cap, ruleId);
  let out = easy.week;
  const changes: Change[] = [...easy.changes];
  const excess = (): number => totalMin(out) - cap;
  const set = (s: Session, after: Session): void => {
    if (after.durMin >= s.durMin) return;
    out = out.map((x) => (x.id === s.id ? after : x));
    changes.push({ ruleId, sessionId: s.id, before: s, after });
  };
  const lowestFirst = (f: (s: Session) => boolean): Session[] =>
    out.filter(f).sort((a, b) => b.priority - a.priority || b.durMin - a.durMin);
  for (const s of lowestFirst(isQ)) if (excess() > 0) set(s, shortenQ(s, excess()));
  const shareFloor = Math.max(MIN_EASY, longShare(out.length) * cap);
  // G2 is exceeded by the long run's minutes above its share, by 10 % of the cap at most (+ 1 min of rounding).
  const over = Math.min(Math.max(0, keepLongMin - shareFloor), 0.1 * cap + 1);
  const lFloor = shareFloor + over;
  for (const s of lowestFirst((x) => x.type === "L"))
    if (excess() > 0) set(s, resize(s, Math.max(lFloor, s.durMin - excess())));
  // The long run she already runs (P14) may exceed soft G2 by its minutes above its share, never more (G2b).
  for (const s of lowestFirst(isContinuous))
    if (excess() > over)
      set(
        s,
        resize(s, Math.max(MIN_EASY, s.type === "L" ? Math.min(keepLongMin, lFloor) : 0, s.durMin - excess() + over)),
      );
  return ruleId.startsWith("G") ? easierQs(out, changes, cap + over, ruleId) : { week: out, changes };
}

/** A load cap the Q's third cannot meet (a chronic load lowered by an illness): the lowest priority Q runs easy (A4d). */
function easierQs(week: Session[], before: Change[], limit: number, ruleId: string) {
  let out = week;
  const changes = [...before];
  for (const s of week.filter(isQ).sort((a, b) => b.priority - a.priority || b.durMin - a.durMin)) {
    const excess = totalMin(out) - limit;
    const after = toEasy(s, Math.max(MIN_EASY, s.durMin - excess));
    if (excess <= 0 || after.durMin >= s.durMin) continue;
    out = out.map((x) => (x.id === s.id ? after : x));
    changes.push({ ruleId, sessionId: s.id, before: s, after });
  }
  return { week: out, changes };
}

/** Minutes actually run in past weeks, oldest first. Strength never counts (G5). */
export type WeekActual = { minutes: number };

/**
 * G2 (7 d ≤ 1.10 × the chronic load: the best of the 4 weeks before), G3 (14 d ≤ 1.30 × the best fortnight of the
 * weeks given), G4 (3
 * rising weeks to above the peak before them → -25 %). A deload, an illness or a skipped run lowers one week, not the
 * chronic load: the week after returns to the plan (Pfitzinger, Daniels; Frandsen 2025 finds no link between
 * week-to-week ratios and injury, research 03 §3.3). G2 is soft: it never takes the long run under `keepLongMin`, the
 * long run she already runs (P14, G2b). `fixedMin`: the minutes of the week's runs kept as they are.
 */
export function weeklyCaps(
  week: Session[],
  prev: WeekActual[],
  keepLongMin = 0,
  fixedMin = 0,
): { week: Session[]; changes: Change[] } {
  const back = prev.map((p) => p.minutes).reverse();
  const [w1, w2, w3, w4] = back;
  const caps: [string, number][] = [];
  if (w1 !== undefined) caps.push(["G2", WEEK_RISE * Math.max(...back.slice(0, CHRONIC_WEEKS))]);
  if (w1 !== undefined && w2 !== undefined && w3 !== undefined) {
    const fortnights = back.slice(1, -1).map((w, k) => w + (back[k + 2] ?? 0));
    caps.push(["G3", FORTNIGHT_RISE * Math.max(...fortnights) - w1]);
  }
  const peakBefore = Math.max(0, ...back.slice(4));
  const rising = w1 !== undefined && w2 !== undefined && w3 !== undefined && w4 !== undefined;
  // A rise that starts from a light week (a deload, an illness, a break: under 80 % of the peak) is a return.
  const fromLight = w4 !== undefined && w4 < LIGHT * peakBefore;
  if (rising && w1 > w2 && w2 > w3 && w3 > w4 && w1 > peakBefore && !fromLight) caps.push(["G4", 0.75 * w1]);
  const tightest = caps.sort((a, b) => a[1] - b[1])[0];
  // What the week already holds (runs done, today's, hers) leaves the rest of the cap to the new sessions.
  const room = (tightest?.[1] ?? 0) - fixedMin;
  if (!tightest || totalMin(week) <= room) return { week, changes: [] };
  // Whole minutes; the epsilon absorbs float noise such as 1.1 × 190 = 209.00000000000003.
  return trimTo(week, Math.floor(room + 1e-9), tightest[0], tightest[0] === "G2" ? keepLongMin : 0);
}

const zoneTime = (week: Session[], test: (rpe: number) => boolean): number =>
  week.flatMap((s) => s.steps).reduce((sum, st) => sum + (test(st.target.rpe) ? stepTotal(st) : 0), 0);

/**
 * P16 on planned training time: Z1 = RPE ≤ 4, Z3 = RPE ≥ 8. A test or a race measures her, it is not training
 * intensity (like G1 and P11 leave the race out, P24).
 */
export function distributionCheck(week: Session[], phase: Phase): { ok: boolean; z1: number; z3: number } {
  const training = week.filter((s) => s.type !== "TEST" && s.type !== "RACE");
  const all = totalMin(training) || 1;
  const z1 = zoneTime(training, (r) => r <= 4) / all;
  const z3 = zoneTime(training, (r) => r >= 8) / all;
  return { ok: z1 >= (phase === "base" ? 0.9 : 0.75) && z3 <= 0.1, z1, z3 };
}

/** The minutes P16 takes off a Q go to the shortest easy run, up to 75 min and 3/4 of the long run (P15). */
function toEasiest(week: Session[], minutes: number): Session[] {
  const top = Math.min(
    MAX_E,
    ...week.filter((s) => s.type === "L").map((s) => Math.max(MIN_E, EASY_TO_LONG * s.durMin)),
  );
  const e = week.filter((s) => s.type === "E" && s.durMin + minutes <= top).sort((a, b) => a.durMin - b.durMin)[0];
  return e ? week.map((s) => (s.id === e.id ? resize(e, e.durMin + minutes) : s)) : week;
}

/** Shortest block a continuous Q keeps under P16 (Daniels' shortest tempo). */
const MIN_BLOCK = 10;
/** Fractions of the Q's fast work (a fartlek opens on an easy block). */
const workReps = (s: Session): number => s.steps.find((st) => st.kind === "work" && st.zone !== "E")?.reps ?? 1;
const mainBlock = (s: Session): number =>
  Math.max(0, ...s.steps.filter((st) => st.kind === "work" && st.zone !== "E").map((st) => st.durMin));

const isThreshold = (s: Session): boolean => s.type === "T" || s.type === "CRUISE";
const thresholdWork = (s: Session): number =>
  s.steps.filter((st) => st.kind === "work" && st.zone === "T").reduce((sum, st) => sum + stepTotal(st), 0);

/** The long run's race-pace block 10 % shorter, its minutes run easy in the same long run; none under 10 min. */
function cutLongBlock(s: Session): Session | null {
  const i = s.steps.findIndex((st) => st.kind === "work" && st.zone === "race");
  const block = s.steps[i];
  if (s.type !== "L" || !block || block.durMin <= MIN_BLOCK) return null;
  const cut = Math.min(Math.max(1, Math.round(0.1 * block.durMin)), block.durMin - MIN_BLOCK);
  const steps = s.steps.map((st, k) =>
    k === i
      ? { ...st, durMin: st.durMin - cut }
      : st.kind === "work" && st.zone === "E"
        ? { ...st, durMin: st.durMin + cut }
        : st,
  );
  return withSteps(s, steps);
}

/**
 * P16's next cut on a Q: a fraction less, else its main block 10 % shorter. Null when it cannot shrink, or when
 * `keepFloor` and the cut would take a threshold session under its floor (T_FLOOR).
 */
function cutQ(s: Session, keepFloor: boolean): Session | null {
  if (s.type === "L") return cutLongBlock(s);
  if (!isQ(s)) return null;
  const after = workReps(s) > 2 ? withReps(s, workReps(s) - 1) : cutBlock(s);
  return after && keepFloor && isThreshold(s) && thresholdWork(after) < T_FLOOR ? null : after;
}

function cutBlock(s: Session): Session | null {
  const block = mainBlock(s);
  const cut = Math.min(Math.max(1, 0.1 * block), block - MIN_BLOCK);
  return block > MIN_BLOCK ? resize(s, s.durMin - workReps(s) * cut) : null;
}

/** Race-pace work first (the long run's block, then SPE), threshold last: the half's key session (Pfitzinger). */
const raceFirst = (s: Session): number => (s.type === "L" ? 0 : s.type === "SPE" ? 1 : 2);

/** The Q P16 cuts next: by intensity when too much is hard (Z3), else race pace before threshold, at its floor first. */
function nextCut(week: Session[], tooHard: boolean): { q: Session; after: Session } | null {
  for (const keepFloor of [true, false]) {
    const cuts = week.flatMap((q) => {
      const after = cutQ(q, keepFloor);
      return after ? [{ q, after }] : [];
    });
    const order = (s: Session): number => (tooHard ? 0 : raceFirst(s));
    cuts.sort((a, b) => order(a.q) - order(b.q) || b.q.rpeTarget - a.q.rpeTarget);
    const first = cuts.find((c) => !tooHard || c.q.rpeTarget >= 8) ?? cuts[0];
    if (first) return first;
  }
  return null;
}

/**
 * P16: shortens a Q until the distribution holds: fractions first, then continuous blocks (Seiler 2010, Rosenblat
 * 2025: easy time stays at 75 % or more). Race-pace blocks go before threshold, which keeps its 20 min while anything
 * else can give. The week keeps its volume: the minutes move to an easy run (P15).
 */
export function enforceDistribution(week: Session[], phase: Phase): { week: Session[]; changes: Change[] } {
  let out = week;
  const changes: Change[] = [];
  for (let guard = 0; guard < 50; guard++) {
    const check = distributionCheck(out, phase);
    if (check.ok) break;
    const next = nextCut(out, check.z3 > 0.1);
    const q = next?.q;
    const after = next?.after;
    if (!q || !after) break;
    out = toEasiest(
      out.map((x) => (x.id === q.id ? after : x)),
      q.durMin - after.durMin,
    );
    changes.push({ ruleId: "P16", sessionId: q.id, before: q, after });
  }
  return { week: out, changes };
}

/** G7: return after a break without illness or pain. */
export function returnAfterBreak(daysOff: number): { factor: number; allowQ: boolean; paceSlowdown: number } {
  if (daysOff >= 28) return { factor: 0.45, allowQ: false, paceSlowdown: 0.04 };
  if (daysOff >= 14) return { factor: 0.55, allowQ: false, paceSlowdown: 0.04 };
  if (daysOff >= 7) return { factor: 0.7, allowQ: false, paceSlowdown: 0.02 };
  if (daysOff >= 3) return { factor: 0.85, allowQ: true, paceSlowdown: 0 };
  return { factor: 1, allowQ: true, paceSlowdown: 0 };
}

/** G7 applied to the first week back: durations × factor, Q replaced by easy runs when not allowed. */
export function resumeWeek(week: Session[], daysOff: number): { week: Session[]; changes: Change[] } {
  const rule = returnAfterBreak(daysOff);
  if (rule.factor === 1) return { week, changes: [] };
  const changes: Change[] = [];
  const out = week.map((s) => {
    const dur = Math.floor(s.durMin * rule.factor);
    const after = isHard(s) && s.type !== "L" && !rule.allowQ ? toEasy(s, dur) : resize(s, dur);
    changes.push({ ruleId: "G7", sessionId: s.id, before: s, after });
    return after;
  });
  return { week: out, changes };
}

export type ValidateCtx = {
  longest30dMin?: number;
  /** Minutes run in the 7 days before the week and in the 14 days before those. */
  last7dMin?: number;
  prev14dMin?: number;
  /** Planned load of sessions changed with Changer (EV6). */
  plannedLoads?: Record<string, number>;
};

type Violations = { ruleId: string; sessionId: string }[];

function sessionViolations(s: Session, week: WeekState, ctx: ValidateCtx): Violations {
  const out: Violations = checkHard(s, slotOf(s), week).map((x) => ({ ruleId: x.ruleId, sessionId: s.id }));
  // The race is her goal's distance, not a planned rise (P24).
  if (ctx.longest30dMin !== undefined && s.type !== "RACE" && s.durMin > SPIKE * ctx.longest30dMin)
    out.push({ ruleId: "G1", sessionId: s.id });
  const planned = ctx.plannedLoads?.[s.id];
  if (planned !== undefined && sessionLoad(s) > planned) out.push({ ruleId: "CHANGE_LOAD", sessionId: s.id });
  return out;
}

/** G8: H1 to H7, G1, G3, P11 and EV6. Manual and done sessions are fixed and only warned about (H10). */
export function validateWeek(week: WeekState, ctx: ValidateCtx = {}): { ok: boolean; violations: Violations } {
  const planned = week.sessions.filter((s) => s.status === "planned" && s.start !== "");
  const violations = planned.filter((s) => !s.manual).flatMap((s) => sessionViolations(s, week, ctx));
  const qs = planned.filter((s) => isHard(s) && s.type !== "L" && s.type !== "RACE");
  const longs = planned.filter((s) => s.type === "L");
  if (qs.length > 2 || longs.length > 1)
    violations.push({ ruleId: "P11", sessionId: (qs[2] ?? longs[1] ?? qs[0])?.id ?? "" });
  if (
    ctx.last7dMin !== undefined &&
    ctx.prev14dMin !== undefined &&
    ctx.last7dMin + totalMin(planned) > FORTNIGHT_RISE * ctx.prev14dMin
  ) {
    violations.push({ ruleId: "G3", sessionId: "" });
  }
  return { ok: violations.length === 0, violations };
}

export type DayLoad = { ctl: number; atl: number };

/** G6: CTL/ATL (τ 42 and 7 days) from daily sRPE, display only. */
export function trainingLoad(dailyLoads: number[]): DayLoad {
  return dailyLoads.reduce(
    (acc, load) => ({ ctl: acc.ctl + (load - acc.ctl) / 42, atl: acc.atl + (load - acc.atl) / 7 }),
    { ctl: 0, atl: 0 },
  );
}
