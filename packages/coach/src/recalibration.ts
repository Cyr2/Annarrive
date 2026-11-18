import { repace } from "./catalog.ts";
import { addDays, dateOf, daysBetween } from "./dates.ts";
import { type InitialFitness, isEligibleEffort, paces, speedForVo2, vdot, vo2 } from "./fitness.ts";
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
  const v = vdot(a.distM, a.durMin);
  if (v > current + 0.5) return proposal("vdot", current, v, "RC1", [a.id], ctx.now);
  const excused =
    (a.tempC ?? 0) > 15 || (a.elevGainM ?? 0) / a.distM >= 0.01 || ctx.illnessLast14d === true || a.feel === "easy";
  if (current - v >= 1.5 && !excused) return proposal("vdot", current, v, "RC2", [a.id], ctx.now);
  return null;
}

/**
 * F10 then RC11: once a provisional level meets its first measured effort, the measured VDOT is proposed,
 * never applied, under the same 0.5 threshold as RC1.
 */
export function proposeMeasured(current: number, measured: InitialFitness, now: string): Proposal | null {
  if (measured.status !== "measured" || Math.abs(measured.vdot - current) <= 0.5) return null;
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

/** F7's share of VDOT for the pace a key session aims at. */
const ZONE_FRACTION: Partial<Record<Session["type"], number>> = { T: 0.88, CRUISE: 0.88, I: 0.975 };

/** RC3: the VDOT whose pace for that zone is the one she held (F7 inverted). */
const impliedVdot = (k: KeySession, current: number): number => {
  const f = ZONE_FRACTION[k.session.type] ?? 0.88;
  return vo2((ratio(k) ?? 1) * speedForVo2(f * current)) / f;
};

/**
 * RC3 and RC4 from T, CRUISE and I sessions. Up: the paces they prove (at least +1); the 28-day wait is waived
 * when the proof is strong: both a full point faster, or both felt easy.
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
    .sort((a, b) => a.activity.start.localeCompare(b.activity.start));
  const evidence = (ks: KeySession[]): string[] => ks.map((k) => k.activity.id);
  const up = keys.filter((k) => (ratio(k) ?? 0) >= 1 && (k.hrDelta ?? 0) <= 3 && k.activity.feel !== "hard");
  const proven = Math.min(...up.map((k) => impliedVdot(k, current)));
  const strong = proven >= current + 1 || up.every((k) => k.activity.feel === "easy");
  const settled = lastChange === undefined || daysBetween(lastChange, now) >= 28 || strong;
  if (settled && up.length >= 2 && !refusedRecently(history, true, now)) {
    return proposal("vdot", current, Math.max(current + 1, proven), "RC3", evidence(up), now);
  }
  const lastTwo = keys.slice(-2);
  const slow = lastTwo.length === 2 && lastTwo.every((k) => (ratio(k) ?? 1) < 0.97 && !k.externalFactor);
  if (slow && !refusedRecently(history, false, now))
    return proposal("vdot", current, current - 1, "RC4", evidence(lastTwo), now);
  return null;
}

/** RC5: three "hard" in a row on easy sessions. Anna picks -1 or a test. */
export function evaluateFeels(feels: FeelLog[], current: number, now: string): Proposal | null {
  const easy = feels.filter((f) => f.rpeTarget <= 4).sort((a, b) => a.date.localeCompare(b.date));
  const last3 = easy.slice(-3);
  if (last3.length < 3 || !last3.every((f) => f.feel === "hard")) return null;
  return proposal(
    "vdot",
    current,
    current - 1,
    "RC5",
    last3.map((f) => f.sessionId),
    now,
  );
}

/** HR at the reference E pace for one run (F15). */
export type HrPace = { date: string; hr: number; hot?: boolean };

function hrDrift(points: HrPace[], current: number, now: string): Proposal | null {
  const cool = points.filter((p) => !p.hot).sort((a, b) => a.date.localeCompare(b.date));
  const age = (p: HrPace): number => daysBetween(p.date, now);
  const base = cool.filter((p) => age(p) > 28 && age(p) <= 56).map((p) => p.hr);
  if (base.length < 3) return null;
  const ref = base.reduce((a, b) => a + b, 0) / base.length;
  const recent = cool.filter((p) => age(p) <= 28);
  const firstOk = recent.findLastIndex((p) => p.hr < ref + 5);
  const streak = recent.slice(firstOk + 1);
  const first = streak[0];
  if (streak.length < 3 || !first || age(first) < 14) return null;
  return proposal(
    "vdot",
    current,
    current - 1,
    "RC6",
    streak.map((p) => p.date),
    now,
  );
}

function vo2Shift(signals: DailySignal[], now: string): Proposal | null {
  const vals = signals.filter((s) => s.vo2max !== undefined).sort((a, b) => a.date.localeCompare(b.date));
  const before = vals.filter((s) => daysBetween(s.date, now) > 14).at(-1)?.vo2max;
  const window = vals.filter((s) => daysBetween(s.date, now) <= 14).map((s) => s.vo2max ?? 0);
  if (before === undefined || window.length === 0) return null;
  const up = window.every((v) => v - before >= 2);
  const down = window.every((v) => before - v >= 2);
  const last = window.at(-1) ?? before;
  return up || down ? proposal("test", before, last, "RC7", ["garmin_vo2max"], now) : null;
}

/** RC6 (HR drift at easy pace → -1) and RC7 (Garmin VO2max shift → test, never a VDOT). */
export function evaluateTrends(
  signals: DailySignal[],
  hrModel: HrPace[],
  current: number,
  now: string,
): Proposal | null {
  return hrDrift(hrModel, current, now) ?? vo2Shift(signals, now);
}

/** RC10: the projection is off the target by > 2 %; signalled once after two misses in a row, no time proposed. */
export function evaluateGoal(g: {
  p0Min: number;
  targetMin: number;
  rate: number;
  weeksLeft: number;
  previousOff: boolean;
  alreadySignalled: boolean;
}): { off: boolean; signal: boolean } {
  const projected = g.p0Min * (1 - g.rate * g.weeksLeft);
  const off = Math.abs(projected - g.targetMin) / g.targetMin > 0.02;
  return { off, signal: off && g.previousOff && !g.alreadySignalled };
}

/**
 * RC9: new paces for future sessions that are neither frozen nor manual. A test or goal proposal changes no pace;
 * the caller schedules the test or opens the goal screen.
 */
export function acceptProposal(st: State, p: Proposal, now: string): Result {
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
