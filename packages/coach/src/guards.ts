import { isHard, sessionLoad, stepTotal, toEasy, withReps } from "./catalog.ts";
import { checkHard, slotOf } from "./placement.ts";
import type { Change, Phase, Session, WeekState } from "./types.ts";

const SPIKE = 1.1;
const WEEK_RISE = 1.1;
const FORTNIGHT_RISE = 1.3;
const MIN_EASY = 20;

const totalMin = (week: Session[]): number => week.reduce((sum, s) => sum + s.durMin, 0);
const isContinuous = (s: Session): boolean => s.type === "E" || s.type === "RECUP" || s.type === "L";

/** Sets the duration of a continuous run by resizing its main step. */
function resize(s: Session, durMin: number): Session {
  const delta = durMin - s.durMin;
  const main = s.steps.reduce(
    (best, st, i) => (st.kind === "work" && st.durMin > (s.steps[best]?.durMin ?? 0) ? i : best),
    0,
  );
  const steps = s.steps.map((st, i) => (i === main ? { ...st, durMin: Math.max(1, st.durMin + delta) } : st));
  return { ...s, steps, durMin: steps.reduce((sum, st) => sum + stepTotal(st), 0) };
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
    const easy = out.find((x) => x.type === "E" && x.durMin + surplusMin <= SPIKE * longest30dMin);
    if (!easy) continue;
    const grown = resize(easy, easy.durMin + surplusMin);
    out = out.map((x) => (x.id === easy.id ? grown : x));
    changes.push({ ruleId: "G1", sessionId: easy.id, before: easy, after: grown, detail: "surplus moved" });
  }
  return { week: out, changes };
}

/** Shortens continuous runs, lowest priority first, until the week fits `cap` minutes. */
function trimTo(week: Session[], cap: number, ruleId: string): { week: Session[]; changes: Change[] } {
  let out = week;
  const changes: Change[] = [];
  const order = week.filter(isContinuous).sort((a, b) => b.priority - a.priority);
  for (const s of order) {
    const excess = totalMin(out) - cap;
    if (excess <= 0) break;
    const target = Math.max(MIN_EASY, s.durMin - excess);
    if (target >= s.durMin) continue;
    const after = resize(s, target);
    out = out.map((x) => (x.id === s.id ? after : x));
    changes.push({ ruleId, sessionId: s.id, before: s, after });
  }
  return { week: out, changes };
}

/** Minutes actually run in past weeks, oldest first. Strength never counts (G5). */
export type WeekActual = { minutes: number };

/** G2 (7 d ≤ 1.10 × previous 7 d), G3 (14 d ≤ 1.30 × previous 14 d), G4 (3 rising weeks → -25 %). */
export function weeklyCaps(week: Session[], prev: WeekActual[]): { week: Session[]; changes: Change[] } {
  const [w1, w2, w3, w4] = prev.map((p) => p.minutes).reverse();
  const caps: [string, number][] = [];
  if (w1 !== undefined) caps.push(["G2", WEEK_RISE * w1]);
  if (w1 !== undefined && w2 !== undefined && w3 !== undefined) caps.push(["G3", FORTNIGHT_RISE * (w2 + w3) - w1]);
  if (w1 !== undefined && w2 !== undefined && w3 !== undefined && w4 !== undefined && w1 > w2 && w2 > w3 && w3 > w4) {
    caps.push(["G4", 0.75 * w1]);
  }
  const tightest = caps.sort((a, b) => a[1] - b[1])[0];
  if (!tightest || totalMin(week) <= tightest[1]) return { week, changes: [] };
  // Whole minutes; the epsilon absorbs float noise such as 1.1 × 190 = 209.00000000000003.
  return trimTo(week, Math.floor(tightest[1] + 1e-9), tightest[0]);
}

const zoneTime = (week: Session[], test: (rpe: number) => boolean): number =>
  week.flatMap((s) => s.steps).reduce((sum, st) => sum + (test(st.target.rpe) ? stepTotal(st) : 0), 0);

/** P16 on planned time: Z1 = RPE ≤ 4, Z3 = RPE ≥ 8. */
export function distributionCheck(week: Session[], phase: Phase): { ok: boolean; z1: number; z3: number } {
  const all = totalMin(week) || 1;
  const z1 = zoneTime(week, (r) => r <= 4) / all;
  const z3 = zoneTime(week, (r) => r >= 8) / all;
  return { ok: z1 >= (phase === "base" ? 0.9 : 0.75) && z3 <= 0.1, z1, z3 };
}

/** P16: remove fractions from the most intense Q until the distribution holds or nothing is left to remove. */
export function enforceDistribution(week: Session[], phase: Phase): { week: Session[]; changes: Change[] } {
  let out = week;
  const changes: Change[] = [];
  for (let guard = 0; guard < 50 && !distributionCheck(out, phase).ok; guard++) {
    const q = out
      .filter((s) => s.steps.some((st) => st.kind === "work" && (st.reps ?? 1) > 2))
      .sort((a, b) => b.rpeTarget - a.rpeTarget)[0];
    const reps = q?.steps.find((st) => st.kind === "work")?.reps;
    if (!q || reps === undefined) break;
    const after = withReps(q, reps - 1);
    out = out.map((x) => (x.id === q.id ? after : x));
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
