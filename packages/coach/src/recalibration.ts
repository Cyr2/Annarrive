import { FAST_RATIO } from "./adaptation.ts";
import { buildSession, isHard, repace } from "./catalog.ts";
import { addDays, dateOf, daysBetween } from "./dates.ts";
import {
  E_FRACTION,
  effortReadings,
  type InitialFitness,
  isEligibleEffort,
  paces,
  speedForVo2,
  vdot,
  vo2,
} from "./fitness.ts";
import { checkHard, isFrozen, slotOf } from "./placement.ts";
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
  /** Heat, wind, hills, illness or a short night (SG2) on that day, or a run she set aside (RC21): never read. */
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
const T_FRACTION = 0.88;
const ZONE_FRACTION: Partial<Record<Session["type"], number>> = { T: T_FRACTION, CRUISE: T_FRACTION, I: 0.975 };
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

/** RC14: Swain 1994, %HRmax = 0.6463 · %VO2max + 37.182: what a heart-rate gap at a given speed is worth in VDOT. */
const SWAIN = { slope: 0.6463, base: 0.37182 };
/** RC14 (research 08): laps of 8 min or more (cardiac lag), started in the first 20 min of work (drift), flat and cool. */
const HR_LAP_MIN = 8;
const HR_WORK_MIN = 20;
const HOT_C = 20;
/** RC14: each of the two sessions 4 bpm under her own baseline: at 3, half its rises overshot her level under the bench noise. */
const HR_DROP = 4;
const PAIR_DAYS = 21;
const HR_RISE_MIN = 0.5;

type HrRead = { k: KeySession; v: number; hr: number; share: number };

/** VDOT whose heart rate at speed v is hr (Swain), so runs at different speeds compare. */
const hrLevel = (v: number, hr: number, hrMax: number): number => (vo2(v) * SWAIN.slope) / (hr / hrMax - SWAIN.base);
const hrAt = (v: number, level: number, hrMax: number): number => hrMax * (SWAIN.base + (SWAIN.slope * vo2(v)) / level);

/**
 * RC14: speed and heart rate of a T or CRUISE run's steady work, and how far that heart rate puts her above the level
 * the session was built for. Null in the heat, on hills, with an external factor or without long enough laps.
 */
function hrRead(k: KeySession, hrMax: number): HrRead | null {
  const target = targetSpeed(k.session);
  const a = k.activity;
  const flat = (a.elevGainM ?? 0) / a.distM < 0.01;
  if (!target || !flat || (a.tempC ?? 0) > HOT_C || k.externalFactor || a.feel === "hard") return null;
  const read = { work: 0, durMin: 0, distM: 0, beats: 0 };
  for (const lap of a.laps ?? []) {
    if (lap.durMin <= 0 || Math.abs(lap.distM / lap.durMin / target - 1) > 0.1) continue;
    if (lap.avgHr !== undefined && lap.durMin >= HR_LAP_MIN && read.work < HR_WORK_MIN)
      [read.durMin, read.distM, read.beats] = [
        read.durMin + lap.durMin,
        read.distM + lap.distM,
        read.beats + lap.avgHr * lap.durMin,
      ];
    read.work += lap.durMin;
  }
  if (read.durMin === 0) return null;
  const [v, hr] = [read.distM / read.durMin, read.beats / read.durMin];
  const built = vo2(target) / (ZONE_FRACTION[k.session.type] ?? 0.88);
  return { k, v, hr, share: hrLevel(v, hr, hrMax) / built };
}

/**
 * RC14: the same pace with a clearly lower heart rate. The last two readable T or CRUISE runs, 21 days apart at most
 * and run since the last change, each 4 bpm under what her earlier runs predict at their speed; the smaller gain
 * (Swain), one point at most, never down. Waits like RC3.
 */
const hrReads = (done: KeySession[], hrMax: number): HrRead[] =>
  done
    .filter((k) => k.session.type === "T" || k.session.type === "CRUISE")
    .sort((a, b) => a.activity.start.localeCompare(b.activity.start))
    .flatMap((k) => hrRead(k, hrMax) ?? []);

function hrRise(
  done: KeySession[],
  current: number,
  lastChange: string | undefined,
  hrMax: number,
): { gain: number; evidence: string[] } | null {
  const reads = hrReads(done, hrMax);
  const pair = reads.slice(-2);
  const base = reads.slice(0, -2);
  const [first, last] = pair;
  if (!first || !last || base.length === 0 || daysBetween(first.k.activity.start, last.k.activity.start) > PAIR_DAYS)
    return null;
  if (lastChange !== undefined && dateOf(first.k.activity.start) <= lastChange) return null;
  const usual = base.reduce((s, r) => s + r.share, 0) / base.length;
  // The heart rate she would have at that speed with her usual share: the gap is what she gained since.
  const drop = (r: HrRead): number => hrAt(r.v, (hrLevel(r.v, r.hr, hrMax) * usual) / r.share, hrMax) - r.hr;
  const gain = current * (Math.min(...pair.map((r) => r.share)) / usual - 1);
  if (!pair.every((r) => drop(r) >= HR_DROP)) return null;
  return gain >= HR_RISE_MIN ? { gain, evidence: pair.map((r) => r.k.activity.id) } : null;
}

/** RC15: one typical error of exercise HR (3 %, Buchheit 2014) over the anchor: at 4, the bench noise made false rises. */
const LTHR_GAP = 5;
/** RC15: run at her current T pace or faster (the 2 % RC3 and RC4 leave as noise). */
const T_HELD = 0.98;

type LthrRead = { gain: number; evidence: string[]; above: boolean };

/**
 * RC15: the last two readable T or CRUISE runs since the last change, 21 days apart at most, at her current T pace or
 * faster, against her threshold heart rate (F14, NV3). Both 5 bpm under it: the VDOT whose T pace she would run at
 * LTHR, by Swain's slope from her own run, the smaller of the two. Both 5 bpm over it: `above`, never a decrease.
 */
function lthrRead(
  done: KeySession[],
  current: number,
  lastChange: string | undefined,
  hrMax: number,
  lthr: number,
): LthrRead | null {
  const tSpeed = speedForVo2(T_FRACTION * current);
  const pair = hrReads(done, hrMax)
    .filter((r) => lastChange === undefined || dateOf(r.k.activity.start) > lastChange)
    .slice(-2);
  const [first, last] = pair;
  if (!first || !last || daysBetween(first.k.activity.start, last.k.activity.start) > PAIR_DAYS) return null;
  if (!pair.every((r) => r.v >= T_HELD * tSpeed)) return null;
  // Swain: each share of HRmax is 0.6463 share of VO2max, her current level standing for VO2max (low if she is fitter).
  const atLthr = (r: HrRead): number => (vo2(r.v) + ((lthr - r.hr) / hrMax / SWAIN.slope) * current) / T_FRACTION;
  const below = pair.every((r) => lthr - r.hr >= LTHR_GAP);
  return {
    gain: below ? Math.min(...pair.map(atLthr)) - current : 0,
    evidence: pair.map((r) => r.k.activity.id),
    above: pair.every((r) => r.hr - lthr >= LTHR_GAP),
  };
}

/**
 * RC3 and RC4 from T, CRUISE and I sessions run after the last level change. Up: at least two sessions 2 % faster
 * than their targets with a supporting sign; the proven VDOT, one point at most (research 02 R23), 28 days after the
 * last change, or 14 when the sessions prove a full point. Else RC15 against her threshold heart rate `lthr`, then
 * RC14 from her heart rate when `hrMax` is known; a heart rate over `lthr` at T pace stops both (to review, not a drop).
 */
export function evaluateKeySessions(
  done: KeySession[],
  current: number,
  lastChange: string | undefined,
  history: PastProposal[],
  now: string,
  hrMax?: number,
  lthr?: number,
): Proposal | null {
  // RC21: a run set aside (a cause she gave) is read by no rule, up or down.
  const read = done.filter((k) => !k.externalFactor);
  const keys = read
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
  const byHeart = (ruleId: string, r: { gain: number; evidence: string[] } | null): Proposal | null => {
    const due = r && r.gain >= HR_RISE_MIN && (days >= SETTLE_DAYS || (days >= PROPOSAL_DAYS && r.gain >= 1));
    if (!due || refusedRecently(history, true, now) || proposedRecently(history, ruleId, now)) return null;
    return proposal("vdot", current, current + Math.min(r.gain, 1), ruleId, r.evidence, now);
  };
  const anchor = hrMax === undefined || lthr === undefined ? null : lthrRead(read, current, lastChange, hrMax, lthr);
  const relative = hrMax === undefined || anchor?.above ? null : hrRise(read, current, lastChange, hrMax);
  const rise =
    byHeart("RC15", anchor) ??
    byHeart("RC14", relative) ??
    (hrMax === undefined ? null : byHeart("RC16", easyRise(read, current, lastChange, hrMax)));
  if (rise) return rise;
  // RC20: never against the last change within 14 days of it, so stable data never makes a yo-yo.
  if (days < REVERSE_DAYS) return null;
  return easing({
    read,
    keys,
    current,
    lastChange,
    history,
    now,
    hrMax,
    above: anchor?.above ? anchor.evidence : null,
  });
}

type Easing = {
  read: KeySession[];
  keys: KeySession[];
  current: number;
  lastChange: string | undefined;
  history: PastProposal[];
  now: string;
  hrMax: number | undefined;
  /** RC19: the two threshold runs over her threshold heart rate (RC15), if any. */
  above: string[] | null;
};

/** RC17's test, then RC4, RC19 and RC18: what makes the plan easier, one point at most, never within RC20's 14 days. */
function easing(e: Easing): Proposal | null {
  const { keys, current, history, now } = e;
  const felt = easyKeys(keys);
  if (felt && !proposedRecently(history, "RC17", now)) return proposal("test", current, current, "RC17", felt, now);
  const down = (ruleId: string, to: number, ids: string[]): Proposal | null =>
    refusedRecently(history, false, now) || proposedRecently(history, ruleId, now)
      ? null
      : proposal("vdot", current, Math.max(to, current - 1), ruleId, ids, now);
  const ids = (ks: KeySession[]): string[] => ks.map((k) => k.activity.id);
  const lastTwo = keys.slice(-2);
  if (lastTwo.length === 2 && lastTwo.every((k) => (ratio(k) ?? 1) < 0.97))
    return down("RC4", current - 1, ids(lastTwo));
  const lastThree = keys.slice(-3);
  const hard = lastThree.length === 3 && lastThree.every((k) => k.activity.feel === "hard" && (ratio(k) ?? 1) >= 0.97);
  if (hard) return down("RC19", current - 1, ids(lastThree));
  if (e.above) return down("RC19", current - 1, e.above);
  const heavy = e.hrMax === undefined ? null : easyDrop(e.read, current, e.lastChange, e.hrMax);
  return heavy && heavy.to <= current - HR_RISE_MIN ? down("RC18", heavy.to, heavy.evidence) : null;
}

/** RC20: a reading against the last change waits 14 days after it (no up then down on the same evidence). */
const REVERSE_DAYS = 14;

/**
 * RC17: her last three T, CRUISE or I runs since the last change felt easy at the target pace (2 % slower at most),
 * heart rate not above what F15 predicts when known: a test, like RC13. A feel says she is better, not by how much;
 * a point given on it delayed the retest of P26 that measured 2.7 (bench, retour-marathon, 26/11/2026).
 */
const EASY_KEYS = 3;
const HELD = 0.98;
function easyKeys(keys: KeySession[]): string[] | null {
  const last = keys.slice(-EASY_KEYS);
  const easy = last.every(
    (k) => k.activity.feel === "easy" && (ratio(k) ?? 0) >= HELD && (k.hrDelta === undefined || k.hrDelta <= 0),
  );
  return last.length === EASY_KEYS && easy ? last.map((k) => k.activity.id) : null;
}

/** Daniels: easy running is 59 to 74 % of VO2max, 65 to 79 % of HRmax; the top of both (F7, research 09). */
const E_HR_TOP = 0.79;
/** RC18: one typical error of exercise heart rate over the ceiling (Buchheit 2014: 1 to 3 %), not noise. */
const E_HR_OVER = 3;
/** RC16: clearly faster than her E pace, RC3's 2 %. */
const E_FASTER = 1.02;
const EASY_MIN = 20;
/** Laps of 5 min or more: the strides and their jogs at the end of a footing do not count as its pace. */
const EASY_LAP_MIN = 5;
const EASY_UP_RUNS = 3;
const EASY_DOWN_DAYS = 10;

type EasyRead = { id: string; start: string; v: number; hr: number };

/** Speed and heart rate of an easy run's steady part, flat and cool. */
function easyRead(k: KeySession): EasyRead | null {
  const a = k.activity;
  const easy = k.session.type === "E" || k.session.type === "RECUP" || k.session.type === "L";
  const flat = (a.elevGainM ?? 0) / a.distM < 0.01;
  if (!easy || !flat || (a.tempC ?? 0) > HOT_C || a.durMin < EASY_MIN) return null;
  const laps = (a.laps ?? []).filter((l) => l.durMin >= EASY_LAP_MIN && l.avgHr !== undefined);
  const durMin = laps.reduce((t, l) => t + l.durMin, 0);
  if (durMin > 0) {
    const beats = laps.reduce((t, l) => t + (l.avgHr ?? 0) * l.durMin, 0);
    return { id: a.id, start: a.start, v: laps.reduce((t, l) => t + l.distM, 0) / durMin, hr: beats / durMin };
  }
  return a.avgHr === undefined ? null : { id: a.id, start: a.start, v: a.distM / a.durMin, hr: a.avgHr };
}

const easyReads = (done: KeySession[], lastChange: string | undefined): EasyRead[] =>
  done
    .filter((k) => lastChange === undefined || dateOf(k.activity.start) > lastChange)
    .sort((a, b) => a.activity.start.localeCompare(b.activity.start))
    .flatMap((k) => easyRead(k) ?? []);

/**
 * RC16: her last three easy runs since the last change, 21 days apart at most, 2 % faster than her E pace with a
 * heart rate under Daniels' easy ceiling: the pace she runs easy is at most the fast end of E (Daniels' paired bands),
 * so it proves the level whose E it is, the smallest of the three.
 */
function easyRise(
  done: KeySession[],
  current: number,
  lastChange: string | undefined,
  hrMax: number,
): { gain: number; evidence: string[] } | null {
  const reads = easyReads(done, lastChange).slice(-EASY_UP_RUNS);
  const [first, last] = [reads[0], reads.at(-1)];
  if (reads.length < EASY_UP_RUNS || !first || !last || daysBetween(first.start, last.start) > PAIR_DAYS) return null;
  const eSpeed = speedForVo2(E_FRACTION * current);
  if (!reads.every((r) => r.hr <= E_HR_TOP * hrMax && r.v >= E_FASTER * eSpeed)) return null;
  const gain = Math.min(...reads.map((r) => vo2(r.v) / E_FRACTION)) - current;
  return { gain, evidence: reads.map((r) => r.id) };
}

/**
 * RC18: her last two easy runs since the last change, 10 days apart at most, at her E pace or slower, each 3 bpm over
 * Daniels' easy ceiling: the level whose E she would run at the ceiling, by Swain's slope as RC15, the higher of the
 * two (the smaller drop).
 */
function easyDrop(
  done: KeySession[],
  current: number,
  lastChange: string | undefined,
  hrMax: number,
): { to: number; evidence: string[] } | null {
  const pair = easyReads(done, lastChange).slice(-2);
  const [first, last] = pair;
  if (!first || !last || daysBetween(first.start, last.start) > EASY_DOWN_DAYS) return null;
  const cap = E_HR_TOP * hrMax;
  const eSpeed = speedForVo2(E_FRACTION * current);
  if (!pair.every((r) => r.hr >= cap + E_HR_OVER && r.v <= E_FASTER * eSpeed)) return null;
  const atCap = (r: EasyRead): number => (vo2(r.v) - ((r.hr - cap) / hrMax / SWAIN.slope) * current) / E_FRACTION;
  return { to: Math.max(...pair.map(atCap)), evidence: pair.map((r) => r.id) };
}

/** RC21: she sets aside a run of the last 7 days only, two in any 14 days at most: past that, a cause is a pattern. */
const SET_ASIDE_DAYS = 7;
const SET_ASIDE_MAX = 2;
const SET_ASIDE_WINDOW = 14;

/** RC21: why a run may not be set aside, or null. `setAside`: start of the runs already set aside. */
export function setAsideRefusal(runStart: string, setAside: string[], now: string): "too_old" | "too_many" | null {
  if (daysBetween(runStart, now) > SET_ASIDE_DAYS) return "too_old";
  const recent = setAside.filter((start) => daysBetween(start, now) < SET_ASIDE_WINDOW);
  return recent.length >= SET_ASIDE_MAX ? "too_many" : null;
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
  const since = (f: FeelLog): boolean =>
    f.externalFactor !== true && (ctx.lastChange === undefined || f.date > ctx.lastChange);
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

/** C4: a step still holding a [fast, slow] range, as sessions stored before one pace per step did. */
const hasRange = (s: Session): boolean =>
  s.steps.some(
    (st) => st.zone && st.zone !== "race" && st.target.paceSKm && st.target.paceSKm[0] !== st.target.paceSKm[1],
  );

/**
 * C4 repair: sessions ahead that still hold a range take one pace each, and automatic ones built with older paces
 * (F7's E moved to the band's fast end on 26/11/2026) take today's; frozen (12 h) and past ones stay as they are.
 */
export function repaceRanges(st: State, now: string): Result {
  const p = paces(st.vdot);
  const changes: Result["changes"] = [];
  const sessions = st.sessions.map((s) => {
    if (s.status !== "planned" || isFrozen(s, now)) return s;
    const stale = !s.manual && JSON.stringify(repace(s, p).steps) !== JSON.stringify(s.steps);
    if (!hasRange(s) && !stale) return s;
    const after = repace(s, p);
    changes.push({ ruleId: "C4", sessionId: s.id, before: s, after });
    return after;
  });
  return { ok: true, state: { ...st, sessions }, previous: st, changes, warnings: [] };
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
