import { FAST_RATIO } from "./adaptation.ts";
import { buildSession, isHard, repace } from "./catalog.ts";
import { addDays, dateOf, daysBetween } from "./dates.ts";
import { effortReadings, type InitialFitness, isEligibleEffort, paces, speedForVo2, vdot, vo2 } from "./fitness.ts";
import { checkHard, slotOf } from "./placement.ts";
import { ranEasy } from "./readiness.ts";
import type { Activity, DailySignal, FeelLog, Proposal, Result, Session, State } from "./types.ts";

const PROPOSAL_DAYS = 14;
const round2 = (x: number): number => Math.round(x * 100) / 100;
const proposal = (
  kind: Proposal["kind"],
  from: number,
  to: number,
  ruleId: string,
  evidence: string[],
  now: string,
): Proposal => ({
  kind,
  from: round2(from),
  to: round2(to),
  ruleId,
  evidence,
  expiresOn: addDays(dateOf(now), PROPOSAL_DAYS),
});

export type RaceCtx = { hrMax: number; lthr?: number; illnessLast14d?: boolean; now: string };

/** RC1, RC2: an eligible race or test proposes its own VDOT when clearly better, or clearly worse without excuse. */
export function evaluateRace(a: Activity, current: number, ctx: RaceCtx): Proposal | null {
  if (!(a.isRace || a.isTest) || !isEligibleEffort(a, ctx).ok) return null;
  // A test is run inside a warm-up and a cool-down: its effort is its laps (F18), not the whole run.
  const v = a.isTest
    ? (effortReadings({ activities: [a], hr: { hrMax: ctx.hrMax } }, ctx.now)[0]?.vdot ?? vdot(a.distM, a.durMin))
    : vdot(a.distM, a.durMin);
  if (v > current + 0.5) return proposal("vdot", current, v, "RC1", [a.id], ctx.now);
  const excused =
    (a.tempC ?? 0) > 15 || (a.elevGainM ?? 0) / a.distM >= 0.01 || ctx.illnessLast14d === true || a.feel === "easy";
  if (current - v >= 1.5 && !excused) return proposal("vdot", current, v, "RC2", [a.id], ctx.now);
  return null;
}

/**
 * F10 then RC11: a level F10 set on its own meets a better reading, never applied, under the same 0.5 threshold as
 * RC1. A provisional level takes the measured one either way; a measured one only rises (`riseOnly`): lowering it
 * takes a performance (RC2, RC4). One proposal per 14 days (RC8).
 */
export function proposeMeasured(
  current: number,
  measured: InitialFitness,
  now: string,
  opts: { riseOnly?: boolean; history?: PastProposal[] } = {},
): Proposal | null {
  const gap = opts.riseOnly ? measured.vdot - current : Math.abs(measured.vdot - current);
  if (measured.status !== "measured" || gap <= 0.5) return null;
  if (proposedRecently(opts.history ?? [], "F10", now)) return null;
  return proposal("vdot", current, measured.vdot, "F10", [measured.source], now);
}

export type KeySession = {
  session: Session;
  activity: Activity;
  /** Achieved speed / target speed for each work fraction (1.01 = 1 % faster). */
  fractions: number[];
  /** Observed HR minus the F15 prediction at that pace. */
  hrDelta?: number;
  /** Heat, wind, hills, illness or a short night (SG2) on that day. */
  externalFactor?: boolean;
};

export type PastProposal = { proposal: Proposal; decision: "accepted" | "refused"; on: string };

/** Mean ratio of a session, aberrant fractions (< 90 % or > 110 %) left out (RC3). */
const ratio = (k: KeySession): number | null => {
  const kept = k.fractions.filter((f) => f >= 0.9 && f <= 1.1);
  return kept.length ? kept.reduce((a, b) => a + b, 0) / kept.length : null;
};

/** RC8: same direction refused less than 14 days ago. */
const refusedRecently = (history: PastProposal[], up: boolean, now: string): boolean =>
  history.some(
    (h) => h.decision === "refused" && h.proposal.to > h.proposal.from === up && daysBetween(h.on, now) < PROPOSAL_DAYS,
  );

/** RC8: one proposal per rule per 14 days, accepted or refused, so the same evidence never ratchets. */
const proposedRecently = (history: PastProposal[], ruleId: string, now: string): boolean =>
  history.some((h) => h.proposal.ruleId === ruleId && daysBetween(h.on, now) < PROPOSAL_DAYS);

/** F7's share of VDOT for the pace a key session aims at. */
const ZONE_FRACTION: Partial<Record<Session["type"], number>> = { T: 0.88, CRUISE: 0.88, I: 0.975 };
/** RC3: a pattern clearly faster than the targets (Runna Pace Insights), not the noise around them. */
const UP_RATIO = 1.02;
const SETTLE_DAYS = 28;

/** Speed (m/min) the session's first work step aimed at. */
const targetSpeed = (s: Session): number | undefined => {
  const pace = s.steps.find((st) => st.kind === "work")?.target.paceSKm;
  return pace ? 120_000 / (pace[0] + pace[1]) : undefined;
};

/** RC3: the VDOT whose pace for that zone is the speed she held (F7 inverted), from the session's own target. */
const impliedVdot = (k: KeySession, current: number): number => {
  const f = ZONE_FRACTION[k.session.type] ?? 0.88;
  return vo2((ratio(k) ?? 1) * (targetSpeed(k.session) ?? speedForVo2(f * current))) / f;
};

/** Felt easy, or heart rate at or under the F15 prediction: what makes a fast session a proof (Daniels). */
const supported = (k: KeySession): boolean => k.activity.feel === "easy" || (k.hrDelta !== undefined && k.hrDelta <= 0);

/**
 * RC3 and RC4 from T, CRUISE and I sessions run after the last level change. Up: at least two sessions 2 % faster
 * than their targets with a supporting sign; the proven VDOT, one point at most (research 02 R23), 28 days after the
 * last change, or 14 when the sessions prove a full point.
 */
export function evaluateKeySessions(
  done: KeySession[],
  current: number,
  lastChange: string | undefined,
  history: PastProposal[],
  now: string,
): Proposal | null {
  const keys = done
    .filter((k) => ZONE_FRACTION[k.session.type] !== undefined)
    .filter((k) => lastChange === undefined || dateOf(k.activity.start) > lastChange)
    .sort((a, b) => a.activity.start.localeCompare(b.activity.start));
  const evidence = (ks: KeySession[]): string[] => ks.map((k) => k.activity.id);
  const days = lastChange === undefined ? Number.POSITIVE_INFINITY : daysBetween(lastChange, now);
  const up = keys.filter(
    (k) => (ratio(k) ?? 0) >= UP_RATIO && (k.hrDelta ?? 0) <= 3 && k.activity.feel !== "hard" && supported(k),
  );
  const proven = Math.min(...up.map((k) => impliedVdot(k, current)));
  const settled = days >= SETTLE_DAYS || (days >= PROPOSAL_DAYS && proven >= current + 1);
  const quiet = !refusedRecently(history, true, now) && !proposedRecently(history, "RC3", now);
  if (up.length >= 2 && settled && proven >= current + 0.5 && quiet) {
    return proposal("vdot", current, Math.min(proven, current + 1), "RC3", evidence(up), now);
  }
  const lastTwo = keys.slice(-2);
  const slow = lastTwo.length === 2 && lastTwo.every((k) => (ratio(k) ?? 1) < 0.97 && !k.externalFactor);
  if (slow && !refusedRecently(history, false, now) && !proposedRecently(history, "RC4", now))
    return proposal("vdot", current, current - 1, "RC4", evidence(lastTwo), now);
  return null;
}

export type FeelCtx = {
  /** Date of the last level change: only the feels after it count. */
  lastChange?: string;
  history?: PastProposal[];
  /** Days with confirmed fatigue (M5): a hard feel on such a day is fatigue, not fitness. */
  fatigueDays?: string[];
};

/**
 * RC5: three "hard" in a row on easy sessions propose a test, never a lower level: a feel mixes fatigue and
 * fitness (Foster 2001, research 03 §6), only a performance proves a loss (RC2, RC4). Confirmed fatigue on those
 * days explains them: the week is lightened instead (P9).
 */
export function evaluateFeels(feels: FeelLog[], current: number, now: string, ctx: FeelCtx = {}): Proposal | null {
  const since = (f: FeelLog): boolean => ctx.lastChange === undefined || f.date > ctx.lastChange;
  const last3 = (keep: (f: FeelLog) => boolean): FeelLog[] =>
    feels
      .filter((f) => keep(f) && since(f))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-3);
  const ids = (fs: FeelLog[]): string[] => fs.map((f) => f.sessionId);
  const history = ctx.history ?? [];
  const hard = last3(ranEasy);
  const tired = hard.some((f) => ctx.fatigueDays?.includes(f.date));
  if (hard.length === 3 && hard.every((f) => f.feel === "hard") && !tired && !proposedRecently(history, "RC5", now))
    return proposal("test", current, current, "RC5", ids(hard), now);
  // RC13: easy sessions felt easy and run clearly faster than their target, three times in a row.
  const fast = last3((f) => f.rpeTarget <= 4);
  const tooEasy = fast.every((f) => f.feel === "easy" && (f.paceRatio ?? 0) >= FAST_RATIO);
  if (fast.length === 3 && tooEasy && !proposedRecently(history, "RC13", now))
    return proposal("test", current, current, "RC13", ids(fast), now);
  return null;
}

/** RC7: Garmin VO2max shifted by 2 or more for 14 days → a test, never a VDOT. */
export function evaluateTrends(signals: DailySignal[], now: string, history: PastProposal[] = []): Proposal | null {
  const vals = signals.filter((s) => s.vo2max !== undefined).sort((a, b) => a.date.localeCompare(b.date));
  const before = vals.filter((s) => daysBetween(s.date, now) > 14).at(-1)?.vo2max;
  const window = vals.filter((s) => daysBetween(s.date, now) <= 14).map((s) => s.vo2max ?? 0);
  if (before === undefined || window.length === 0 || proposedRecently(history, "RC7", now)) return null;
  const up = window.every((v) => v - before >= 2);
  const down = window.every((v) => before - v >= 2);
  const last = window.at(-1) ?? before;
  return up || down ? proposal("test", before, last, "RC7", ["garmin_vo2max"], now) : null;
}

/** A test replaces the next automatic Q (or short-hill run) where it breaks no hard rule (research 02 §7.2). */
function scheduleTest(st: State, now: string): { state: State; changes: Result["changes"] } {
  const test = buildSession("TEST", {
    weeklyMin: 0,
    paces: paces(st.vdot),
    phase: "base",
    progressionStep: 0,
    distM: 5000,
  });
  const fits = (s: Session): boolean => {
    const rest = { ...st, sessions: st.sessions.filter((x) => x.id !== s.id) };
    const at = { ...test, start: s.start };
    return checkHard(at, slotOf(at), rest).length === 0;
  };
  const candidate = st.sessions
    .filter((s) => s.status === "planned" && !s.frozen && !s.manual && s.start > now)
    .filter((s) => (isHard(s) && s.type !== "L" && s.type !== "RACE") || s.type === "FARTLEK" || withStrides(s))
    .sort((a, b) => a.start.localeCompare(b.start))
    .find(fits);
  if (!candidate) return { state: st, changes: [] };
  const after: Session = { ...test, id: candidate.id, start: candidate.start };
  const sessions = st.sessions.map((s) => (s.id === candidate.id ? after : s));
  return {
    state: { ...st, sessions },
    changes: [{ ruleId: "RC9", sessionId: candidate.id, before: candidate, after }],
  };
}

/**
 * RC9: new paces for future sessions that are neither frozen nor manual. A test proposal changes no pace: the test
 * takes the place of the next Q. A goal proposal changes nothing here.
 */
const withStrides = (s: Session): boolean => s.steps.some((st) => st.kind === "strides");

export function acceptProposal(st: State, p: Proposal, now: string): Result {
  if (p.kind === "test") {
    const t = scheduleTest(st, now);
    const changes = [{ ruleId: p.ruleId, detail: p.kind }, ...t.changes];
    return { ok: true, state: t.state, previous: st, changes, warnings: [] };
  }
  if (p.kind !== "vdot")
    return { ok: true, state: st, previous: st, changes: [{ ruleId: p.ruleId, detail: p.kind }], warnings: [] };
  const newPaces = paces(p.to);
  const changes: Result["changes"] = [];
  const sessions = st.sessions.map((s) => {
    if (s.frozen || s.manual || s.status !== "planned" || s.start <= now) return s;
    const after = repace(s, newPaces);
    changes.push({ ruleId: "RC9", sessionId: s.id, before: s, after });
    return after;
  });
  return {
    ok: true,
    state: { ...st, sessions, vdot: p.to, vdotChangedOn: dateOf(now) },
    previous: st,
    changes,
    warnings: [],
  };
}
