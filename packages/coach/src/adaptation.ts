import { isHard, MAX_E, RPE, toEasy } from "./catalog.ts";
import { addDays, addMin, dateOf, mondayOf } from "./dates.ts";
import { paces } from "./fitness.ts";
import { trimEasy, validateWeek } from "./guards.ts";
import { bestSlotFrom, isFrozen } from "./placement.ts";
import type { Activity, Change, Feel, FeelLog, Lap, Paces, Result, Session, State } from "./types.ts";

/** AD1: a run read lap by lap in Daniels' zones, with the catalogue's RPE (E 3, M 6, T 7, I 8). */
export type RunReading = {
  minutes: number;
  /** sRPE of the run as done (Foster 2001): Σ lap minutes × the RPE of its zone. */
  load: number;
  /** Mean RPE of the run as done. */
  rpe: number;
  /** Minutes at threshold or faster (pace or heart rate). */
  fastMin: number;
  /** Minutes at I pace or faster, to name what she did (fractionné rather than tempo). */
  intervalMin: number;
  /** A hard day for placement (H4): more than 6 fast minutes (like a fartlek, M3), or longer than any easy run. */
  hard: boolean;
};

/** AD2: how the run compares with the session it was matched to; `extra` when none was planned. */
export type Deviation = "as_planned" | "easier" | "harder" | "longer" | "shorter" | "other_type" | "extra";

const M_RPE = 6;
/** Daniels: T is run at 88 to 92 % of HRmax. A lap at that heart rate is a threshold lap whatever its pace. */
const T_HR = 0.88;
/** catalogue M3: a fartlek is hard above 6 fast minutes; the same line makes a run a hard day. */
const FAST_MIN = 6;
/** F18's bounds: a lap faster than 2:30 /km or slower than 12:00 /km is a GPS glitch or a stop. */
const PACE_BOUNDS: [number, number] = [150, 720];
/** Laps must cover most of the run to be read; else the run is read as one lap. */
const LAP_COVER = 0.9;
/** AD2: one RPE point above or below the plan, or 20 % of its duration. */
const RPE_GAP = 1;
const LONGER = 1.2;
const SHORTER = 0.8;
/** AD3: a hard day keeps the next hard session 48 h away (research 03 §8.2; S12). */
const SPACING_H = 48;
/** RC13: easy runs 3 % faster than their target (the RC4 band, mirrored). */
export const FAST_RATIO = 1.03;

const paceOf = (l: Lap): number => (l.durMin * 60_000) / l.distM;

function zoneRpe(paceSKm: number, p: Paces): number {
  if (paceSKm <= (p.T + p.I) / 2) return RPE.I;
  if (paceSKm <= (p.M + p.T) / 2) return RPE.T;
  return paceSKm <= (p.E + p.M) / 2 ? M_RPE : RPE.E;
}

const lapRpe = (l: Lap, p: Paces, hrMax?: number): number => {
  const byHr = hrMax !== undefined && l.avgHr !== undefined && l.avgHr >= T_HR * hrMax ? RPE.T : 0;
  return Math.max(zoneRpe(paceOf(l), p), byHr);
};

function lapsOf(a: Activity): Lap[] {
  const ok = (a.laps ?? []).filter((l) => l.distM > 0 && paceOf(l) >= PACE_BOUNDS[0] && paceOf(l) <= PACE_BOUNDS[1]);
  const covered = ok.reduce((s, l) => s + l.durMin, 0);
  if (covered >= LAP_COVER * a.durMin) return ok;
  return a.distM > 0
    ? [{ durMin: a.durMin, distM: a.distM, ...(a.avgHr === undefined ? {} : { avgHr: a.avgHr }) }]
    : [];
}

/** AD1: what she actually ran, in load and zones, from her laps, pace and heart rate. */
export function readRun(a: Activity, p: Paces, hrMax?: number): RunReading {
  const laps = lapsOf(a).map((l) => ({ min: l.durMin, rpe: lapRpe(l, p, hrMax) }));
  const read = laps.reduce((s, l) => s + l.min, 0);
  const load = laps.reduce((s, l) => s + l.min * l.rpe, 0) + (a.durMin - read) * RPE.E;
  const fastMin = laps.filter((l) => l.rpe >= RPE.T).reduce((s, l) => s + l.min, 0);
  const intervalMin = laps.filter((l) => l.rpe >= RPE.I).reduce((s, l) => s + l.min, 0);
  return {
    minutes: a.durMin,
    load,
    rpe: a.durMin > 0 ? load / a.durMin : 0,
    fastMin,
    intervalMin,
    hard: fastMin > FAST_MIN || a.durMin > MAX_E,
  };
}

/** The planned session read with the same scale as the run: each step's target pace in its zone. */
function plannedRpe(s: Session, p: Paces): number {
  const parts = s.steps.map((st) => {
    const pace = st.target.paceSKm;
    const min = st.durMin * (st.reps ?? 1);
    return { min, rpe: pace ? zoneRpe((pace[0] + pace[1]) / 2, p) : st.target.rpe };
  });
  const min = parts.reduce((a, x) => a + x.min, 0);
  return min > 0 ? parts.reduce((a, x) => a + x.min * x.rpe, 0) / min : s.rpeTarget;
}

/** AD2: type first (a quality run on an easy day, or the reverse), then intensity, then duration. */
export function compareRun(s: Session | null, r: RunReading, p: Paces): Deviation {
  if (!s) return "extra";
  const plannedQ = isHard(s) && s.type !== "L";
  if (plannedQ !== r.fastMin > FAST_MIN) return "other_type";
  const planned = plannedRpe(s, p);
  if (r.rpe >= planned + RPE_GAP) return "harder";
  if (r.rpe <= planned - RPE_GAP) return "easier";
  const ratio = r.minutes / s.durMin;
  return ratio >= LONGER ? "longer" : ratio <= SHORTER ? "shorter" : "as_planned";
}

/** Speed of the run over the speed its main step aimed at (1.03 = 3 % faster); undefined without a target. */
export function paceRatio(s: Session, a: Activity): number | undefined {
  const pace = s.steps.find((st) => st.kind === "work")?.target.paceSKm;
  if (!pace || a.distM <= 0 || a.durMin <= 0) return undefined;
  return a.distM / a.durMin / (120_000 / (pace[0] + pace[1]));
}

/** C3 with what she ran: her feel, the RPE of the run as done (SG4, RC5) and her speed against the target (RC13). */
export function feelLog(s: Session, a: Activity, feel: Feel, p: Paces, hrMax?: number): FeelLog {
  const ratio = paceRatio(s, a);
  return {
    sessionId: s.id,
    date: dateOf(s.start),
    feel,
    rpeTarget: s.rpeTarget,
    rpeDone: readRun(a, p, hrMax).rpe,
    ...(ratio === undefined ? {} : { paceRatio: ratio }),
  };
}

type Step = { state: State; changes: Change[] };

const put = (st: State, s: Session): State => ({ ...st, sessions: st.sessions.map((x) => (x.id === s.id ? s : x)) });
const movable = (s: Session, now: string): boolean =>
  s.status === "planned" && s.start > now && !s.manual && !s.frozen && s.type !== "RACE";

/**
 * AD3: a run that was a hard day while the plan had an easy one (or none) keeps the next hard session 48 h away:
 * moved to the best valid slot of its week from two days after the run, else run easy at the same length (D3).
 * Within 12 h it is never moved without her say (H9): it is lightened. The long run is moved, never lightened
 * (research 02 §4.2: the long run is kept first).
 */
function spaceAfter(st: State, run: Activity, now: string): Step {
  const until = addMin(run.start, SPACING_H * 60);
  const next = st.sessions
    .filter((s) => movable(s, now) && s.start < until && isHard(s))
    .sort((a, b) => a.start.localeCompare(b.start))[0];
  if (!next) return { state: st, changes: [] };
  // The run stands in as a hard day, so H4 keeps the moved session off the day after it.
  const standIn: Session = { ...next, id: `run:${run.id}`, start: run.start, status: "done", manual: true };
  const week = { ...st, sessions: [...st.sessions, standIn] };
  const slot = isFrozen(next, now) ? null : bestSlotFrom(next, week, now, addDays(dateOf(run.start), 2));
  if (!slot && next.type === "L") return { state: st, changes: [] };
  const after = slot ? { ...next, start: slot.start } : toEasy(next, next.durMin);
  return { state: put(st, after), changes: [{ ruleId: "AD3", sessionId: next.id, before: next, after }] };
}

/** Minutes she ran in each of the 4 weeks before `monday`, oldest first. */
const chronicWeeks = (history: Activity[], monday: string): number[] =>
  [4, 3, 2, 1].map((k) => {
    const from = addDays(monday, -7 * k);
    const to = addDays(from, 7);
    return history.filter((a) => dateOf(a.start) >= from && dateOf(a.start) < to).reduce((s, a) => s + a.durMin, 0);
  });

/**
 * AD4: what she ran counts in the week (G2): when a run longer than planned, or one more, takes the week over 1.10 ×
 * the chronic load, the easy runs still ahead are shortened down to their catalogue floor (G2b). Nothing else.
 */
function absorbVolume(st: State, run: Activity, now: string, history: Activity[]): Step {
  const monday = mondayOf(run.start);
  const chronic = Math.max(...chronicWeeks(history, monday));
  if (chronic === 0) return { state: st, changes: [] };
  const inWeek = (start: string): boolean => start >= `${monday}T00:00` && dateOf(start) < addDays(monday, 7);
  const runs = history.some((a) => a.id === run.id) ? history : [...history, run];
  const done = runs.filter((a) => inWeek(a.start) && a.start <= now).reduce((s, a) => s + a.durMin, 0);
  const ahead = st.sessions.filter((s) => s.status === "planned" && s.start > now && inWeek(s.start));
  const easy = ahead.filter((s) => movable(s, now) && (s.type === "E" || s.type === "RECUP"));
  const fixed = ahead.filter((s) => !easy.includes(s)).reduce((s, x) => s + x.durMin, 0);
  const budget = Math.floor(1.1 * chronic - done - fixed);
  const trimmed = trimEasy(easy, budget, "AD4");
  return { state: trimmed.week.reduce(put, st), changes: trimmed.changes };
}

export type AdaptCtx = {
  /** The planned session the run was matched to (EV16); none for a run she added. */
  sessionId?: string;
  /** Her runs, this one included or not: the chronic load of G2. */
  history: Activity[];
  hrMax?: number;
};

export type Adaptation = Result & { reading: RunReading; deviation: Deviation };

/**
 * M10: after a synced run, the week follows what she actually did. A hard day where the plan had an easy one moves
 * or lightens the next hard session (AD3); more volume than planned shortens the easy runs ahead (AD4). An easier,
 * shorter or skipped run changes nothing: nothing is made up (EV16, EV21, AD5).
 */
export function adaptToRun(st: State, run: Activity, now: string, ctx: AdaptCtx): Adaptation {
  const p = paces(st.vdot);
  const reading = readRun(run, p, ctx.hrMax);
  const session = st.sessions.find((s) => s.id === ctx.sessionId) ?? null;
  const deviation = compareRun(session, reading, p);
  const changes: Change[] = [];
  let state = st;
  if (reading.hard && !(session && isHard(session))) {
    const spaced = spaceAfter(state, run, now);
    state = spaced.state;
    changes.push(...spaced.changes);
  }
  if (deviation === "longer" || deviation === "extra") {
    const absorbed = absorbVolume(state, run, now, ctx.history);
    state = absorbed.state;
    changes.push(...absorbed.changes);
  }
  return { ok: validateWeek(state).ok, state, previous: st, changes, warnings: [], reading, deviation };
}
