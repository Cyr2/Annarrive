/**
 * Closed loop: every Sunday the coach builds the week (planWeek), every morning it decides (dailyDecision), the
 * scripted runner does or skips each session, and the coach reads what happened (detectMissed, logFeel,
 * recalibration) before the next build. Each step goes through the coach's public API, wired the way
 * apps/server/src/coach-adapter.ts and services/fitness.ts wire it.
 */
import {
  type Activity,
  acceptProposal,
  adaptForHealth,
  adaptToRun,
  addDays,
  addMin,
  at,
  type CalEvent,
  changeOptions,
  confirmDone,
  type DailySignal,
  dailyDecision,
  dailySignals,
  dateOf,
  daysBetween,
  evaluateFeels,
  evaluateKeySessions,
  evaluateRace,
  type FeelLog,
  fatigueDays,
  feelBetter,
  fractionF,
  type Health,
  hoursBetween,
  type InitialFitness,
  initialFitness,
  isHard,
  type KeySession,
  type Lap,
  logFeel,
  onTimetableChange,
  type PaceZone,
  type PastProposal,
  type PlanWeek,
  type Proposal,
  paces,
  planWeek,
  predictTime,
  programPlan,
  proposeMeasured,
  type Result,
  readRun,
  reportUnavailable,
  type Session,
  type SignalId,
  type State,
  type Step,
  sickDays,
  skipSession,
  speedForVo2,
  vdot,
  weekDates,
} from "../src/index.ts";
import { calendar, type Persona, PLAN_START, rng, START_MONDAY } from "./personas.ts";

export type Decision = {
  date: string;
  type: string;
  action: string;
  signals: SignalId[];
  yesterday: SignalId[];
  changed: boolean;
};
export type ProposalLog = { on: string; ruleId: string; from: number; to: number; evidence: number };

export type WeekLog = {
  week: number;
  monday: string;
  /** What the periodised plan (M2, as of the start day) asked for this week. */
  planMin: number;
  phase: string;
  built: Session[];
  final: Session[];
  activities: Activity[];
  cal: CalEvent[];
  vdotStart: number;
  vdotEnd: number;
  trueVdot: number;
  decisions: Decision[];
  proposals: ProposalLog[];
  /** Changes the app made on its own during the week (morning decisions, timetable replans). */
  autoChanges: number;
  /** Changes made because of what she ran (M10): spacing after a hard day (AD3), volume absorbed (AD4). */
  adaptations: string[];
  warnings: string[];
  health: string[];
};

export type RunLog = {
  persona: Persona;
  weeks: WeekLog[];
  initial: InitialFitness;
  history: Activity[];
  vPeak: number;
  planWeeks: number;
  /** P19's class of her target at the start (P21 reads it). */
  feasibility: string;
};

type Sim = {
  p: Persona;
  sessions: Session[];
  activities: Activity[];
  cal: CalEvent[];
  health: Health;
  feels: FeelLog[];
  vdot: number;
  provisional: boolean;
  vdotChangedOn?: string;
  /** Proposals she answered, for RC8 (services/fitness.ts passes the decided ones). */
  answered: PastProposal[];
  signals: DailySignal[];
  next: () => number;
  /** Her real level today: it rises with the training she does (`progress`). */
  truth: number;
  /** Script deviations already done, by "kind-week": one tempo and one extra run a week at most. */
  deviated: Set<string>;
};

const HR_SHARE: Record<PaceZone, number> = { E: 0.72, M: 0.84, T: 0.89, I: 0.935, R: 0.9, race: 0.88 };
/** Heart rate of a 20 min all-out effort: above Daniels' T band. */
const ALL_OUT_HR = 0.94;
const KEY_DAYS = 28;

const state = (sim: Sim, monday: string): State => ({
  monday,
  sessions: sim.sessions,
  cal: sim.cal,
  settings: sim.p.settings,
  health: sim.health,
  feels: sim.feels,
  vdot: sim.vdot,
  ...(sim.vdotChangedOn ? { vdotChangedOn: sim.vdotChangedOn } : {}),
});

function apply(sim: Sim, r: Result): void {
  sim.sessions = r.state.sessions;
  sim.health = r.state.health;
  sim.feels = r.state.feels;
}

const weekOf = (w: number): string => addDays(START_MONDAY, 7 * (w - 1));
const inWeek = (monday: string) => (s: { start: string }) =>
  s.start !== "" && dateOf(s.start) >= monday && dateOf(s.start) < addDays(monday, 7);

// ---------- Before the programme: 8 weeks of runs, 28 days of morning signals ----------

const RUN_DAYS: Record<number, number[]> = { 2: [2, 6], 3: [1, 3, 6], 4: [1, 3, 4, 6], 5: [0, 1, 3, 5, 6] };

function preHistory(p: Persona): Activity[] {
  const eMid = paces(p.trueVdot).E;
  const days = RUN_DAYS[p.history.runsPerWeek] ?? [1, 3, 6];
  return [...Array(8).keys()].flatMap((k) => {
    const monday = addDays(START_MONDAY, -7 * (8 - k));
    const long = 0.35 * p.history.minPerWeek;
    const other = (p.history.minPerWeek - long) / (days.length - 1);
    return days.map((d, i): Activity => {
      const durMin = Math.round(i === days.length - 1 ? long : other);
      const threshold = p.history.thresholdLaps === true && i === 1 && (k === 5 || k === 7);
      const laps: Lap[] = threshold
        ? [
            { durMin: 15, distM: (15 * 60000) / eMid / 1000, avgHr: 0.72 * p.hrMax },
            ...[0, 1, 2, 3].map(() => ({
              durMin: paces(p.trueVdot).T / 60,
              distM: 1000,
              avgHr: 0.885 * p.hrMax,
            })),
          ]
        : [];
      return {
        id: `hist-${monday}-${d}`,
        start: at(addDays(monday, d), "18:00"),
        durMin,
        distM: (durMin * 60 * 1000) / eMid,
        avgHr: 0.72 * p.hrMax,
        laps,
      };
    });
  });
}

type Day = { rhr: number; sleep: number; bb: number; stress: number };
const NORMAL: Day = { rhr: 52, sleep: 450, bb: 70, stress: 30 };

function signalFor(date: string, shift: Partial<Day>, next: () => number): DailySignal {
  const noise = (amp: number): number => (next() - 0.5) * 2 * amp;
  return {
    date,
    rhr: Math.round(NORMAL.rhr + (shift.rhr ?? 0) + noise(1.5)),
    sleepMin: Math.round(NORMAL.sleep + (shift.sleep ?? 0) + noise(30)),
    bodyBatteryWake: Math.round(NORMAL.bb + (shift.bb ?? 0) + noise(6)),
    stressAvg: Math.round(NORMAL.stress + (shift.stress ?? 0) + noise(4)),
  };
}

// ---------- The runner's script ----------

const weekNumber = (date: string): number => Math.floor(daysBetween(START_MONDAY, date) / 7) + 1;
const dayIndex = (date: string): number => daysBetween(START_MONDAY, date) % 7;

const overreaching = (p: Persona, date: string): boolean => {
  const o = p.script.overreach;
  const w = weekNumber(date);
  return o !== undefined && w >= o.from && w <= o.to;
};

function sickWindow(p: Persona): { from: string; better: string } | null {
  const s = p.script.sick;
  if (!s) return null;
  const from = addDays(weekOf(s.week), s.day);
  return { from, better: addDays(from, s.days) };
}

function dayShift(p: Persona, date: string): Partial<Day> {
  const sick = sickWindow(p);
  if (sick && date >= sick.from && date < addDays(sick.better, 2)) return { rhr: 9, sleep: -40, bb: -25 };
  if (overreaching(p, date)) return { rhr: 6, sleep: -110, bb: -20, stress: 12 };
  // One short night on Wednesdays: a single signal, which D2 must ignore.
  if (p.script.oneShortNight && dayIndex(date) === 2) return { sleep: -150 };
  return {};
}

/** Her level on that day: overreaching costs 1.5 VDOT, the 10 days after a fever 1. */
function effectiveVdot(sim: Sim, date: string): number {
  const p = sim.p;
  const sick = sickWindow(p);
  const afterSick = sick !== null && date >= sick.from && daysBetween(sick.from, date) <= 14 ? 1 : 0;
  return sim.truth - (overreaching(p, date) ? 1.5 : 0) - afterSick;
}

const speed = (paceSKm: number): number => 60000 / paceSKm;
const mid = (pace: [number, number] | undefined, fallback: number): number =>
  pace ? (pace[0] + pace[1]) / 2 : fallback;

/** Speed (m/min) she can hold in that zone at her level of the day. */
function trueSpeed(p: Persona, zone: PaceZone, eff: number): number {
  if (zone === "race") return p.goal.distanceM / predictTime(eff, p.goal.distanceM);
  const tp = paces(eff);
  return speed(tp[zone]);
}

/**
 * One lap per repetition, as a structured Garmin workout records it. Slower than the target when she cannot hold it.
 * `own`: the zone she runs on her own whatever the target (easy runs too fast, a tempo instead of a footing).
 */
function stepLaps(sim: Sim, st: Step, day: string, allOut: boolean, own?: PaceZone): { laps: Lap[]; ratio: number } {
  const p = sim.p;
  const appE = paces(sim.vdot).E;
  const zone: PaceZone = own ?? (st.kind === "strides" ? "R" : (st.zone ?? "E"));
  const target = speed(mid(st.target.paceSKm, appE));
  // A test is run all out for its duration, whatever its target pace (F10, catalogue TEST): F2 at her level.
  const eff = effectiveVdot(sim, day);
  const can = allOut ? speedForVo2(eff * fractionF(st.durMin)) : trueSpeed(p, zone, eff);
  const eager = allOut || own ? 1 : (p.script.eagerness ?? 0.2);
  const v = (can < target ? can : target + eager * (can - target)) * (1 + (sim.next() - 0.5) * 0.02);
  const hr = (allOut ? ALL_OUT_HR : HR_SHARE[zone] + (overreaching(p, day) ? 0.02 : 0)) * p.hrMax;
  const laps = [...Array(st.reps ?? 1).keys()].map(() => ({ durMin: st.durMin, distM: v * st.durMin, avgHr: hr }));
  return { laps, ratio: can / target };
}

const isEasyRun = (s: Session): boolean => s.type === "E" || s.type === "RECUP" || s.type === "L";

/** A footing run as 15 min easy, 20 min at threshold, the rest easy (a tempo instead of the footing). */
function asTempo(s: Session): { steps: Step[]; own: (PaceZone | undefined)[] } {
  const t = Math.min(20, Math.max(0, s.durMin - 20));
  const e = s.steps.find((st) => st.zone === "E") ?? s.steps[0];
  const easy = (durMin: number): Step => ({ kind: "work", durMin, zone: "E", target: e?.target ?? { rpe: 3 } });
  return { steps: [easy(15), easy(t), easy(s.durMin - 15 - t)], own: [undefined, "T", undefined] };
}

/** What the script makes of the session: her own zones, a tempo, a long run cut short. */
function deviation(sim: Sim, s: Session): { steps: Step[]; own: (PaceZone | undefined)[]; cut: number } {
  const sc = sim.p.script;
  const key = `tempo-${weekNumber(s.start)}`;
  // The footing she turns into a tempo is one a hard session follows within 48 h: the case spacing must handle.
  const hardSoon = sim.sessions.some(
    (x) => x.status === "planned" && isHard(x) && x.start > s.start && hoursBetween(s.start, x.start) < 48,
  );
  if (sc.tempoForEasy && s.type === "E" && hardSoon && !sim.deviated.has(key)) {
    sim.deviated.add(key);
    return { ...asTempo(s), cut: 1 };
  }
  const own = sc.easyAs && isEasyRun(s) ? sc.easyAs : undefined;
  return {
    steps: s.steps,
    own: s.steps.map((st) => (st.kind === "strides" ? undefined : own)),
    cut: s.type === "L" ? (sc.cutLong ?? 1) : 1,
  };
}

function runSession(sim: Sim, s: Session): Activity {
  const laps: Lap[] = [];
  let hardest = { ratio: 1, rpe: 0 };
  const d = deviation(sim, s);
  d.steps.forEach((st, i) => {
    // A race is run all out at the pace her level holds over the distance, whatever its target.
    const own = d.own[i] ?? (s.type === "RACE" && st.kind === "work" ? "race" : undefined);
    const out = stepLaps(sim, st, dateOf(s.start), s.type === "TEST" && st.kind === "work", own);
    laps.push(...out.laps.map((l) => ({ ...l, durMin: l.durMin * d.cut, distM: l.distM * d.cut })));
    if (st.target.rpe > hardest.rpe && st.kind === "work") hardest = { ratio: out.ratio, rpe: st.target.rpe };
  });
  const dur = laps.reduce((a, l) => a + l.durMin, 0);
  return {
    id: `run-${s.id}`,
    start: s.start,
    durMin: dur,
    distM: laps.reduce((a, l) => a + l.distM, 0),
    avgHr: laps.reduce((a, l) => a + (l.avgHr ?? 0) * l.durMin, 0) / dur,
    laps,
    // Like services/fitness.ts: the run carries the planned type, and a planned test is a test.
    plannedType: s.type,
    ...(s.type === "RACE" ? { isRace: true, tempC: 8 } : {}),
    ...(s.type === "TEST" ? { isTest: true, tempC: 8 } : {}),
    feel: d.own.some((z) => z !== undefined && z !== "race") ? "ok" : feelOf(sim, s, hardest.ratio),
  };
}

function feelOf(sim: Sim, s: Session, ratio: number): Activity["feel"] {
  if (overreaching(sim.p, dateOf(s.start))) return "hard";
  if (!isHard(s) || s.type === "L") return (sim.p.script.eagerness ?? 0) >= 1 ? "easy" : "ok";
  return ratio >= 1.04 ? "easy" : ratio < 0.98 ? "hard" : "ok";
}

/** A run she adds on a day without a session, once a week from Wednesday: 40 min easy. */
function extraRun(sim: Sim, date: string): Activity | null {
  const min = sim.p.script.extraRun;
  const key = `extra-${weekNumber(date)}`;
  if (!min || dayIndex(date) < 2 || sim.deviated.has(key)) return null;
  sim.deviated.add(key);
  const v = trueSpeed(sim.p, "E", effectiveVdot(sim, date));
  return {
    id: `extra-${date}`,
    start: at(date, "12:00"),
    durMin: min,
    distM: v * min,
    avgHr: HR_SHARE.E * sim.p.hrMax,
    laps: [{ durMin: min, distM: v * min, avgHr: HR_SHARE.E * sim.p.hrMax }],
    feel: "ok",
  };
}

function skips(sim: Sim, s: Session, n: number): "explicit" | "silent" | null {
  const sick = sickWindow(sim.p);
  const day = dateOf(s.start);
  if (sick && day >= sick.from && day < sick.better) return "explicit";
  const every = sim.p.script.skipEvery;
  if (every && s.type !== "RACE" && n % every === every - 1) return n % (2 * every) < every ? "explicit" : "silent";
  return null;
}

// ---------- Recalibration, as services/fitness.ts calls it after each run ----------

function keySession(s: Session, a: Activity): KeySession {
  const pace = s.steps.find((st) => st.kind === "work")?.target.paceSKm;
  const target = pace ? 2000 / (pace[0] + pace[1]) : 0;
  const fractions = target ? (a.laps ?? []).map((l) => l.distM / (l.durMin * 60) / target) : [];
  return { session: s, activity: a, fractions };
}

function measuredNow(sim: Sim, now: string): InitialFitness | null {
  try {
    return initialFitness({ activities: sim.activities, hr: { hrMax: sim.p.hrMax } }, now);
  } catch {
    return null;
  }
}

function proposalAfterRun(sim: Sim, run: Activity, now: string): Proposal | null {
  if (sim.provisional) {
    const m = measuredNow(sim, now);
    return m && proposeMeasured(sim.vdot, m, now, { history: sim.answered });
  }
  const race = evaluateRace(run, sim.vdot, { hrMax: sim.p.hrMax, now, illnessLast14d: sim.health.kind === "sick" });
  if (race) return race;
  // A level F10 measured on its own, never confirmed by her, rises with a better reading (F10, RC11).
  const m = sim.vdotChangedOn === undefined ? measuredNow(sim, now) : null;
  const reread = m && proposeMeasured(sim.vdot, m, now, { riseOnly: true, history: sim.answered });
  if (reread) return reread;
  const done = sim.sessions.flatMap((s) => {
    const a = sim.activities.find((x) => x.id === `run-${s.id}`);
    return a && daysBetween(a.start, now) <= KEY_DAYS ? [keySession(s, a)] : [];
  });
  return evaluateKeySessions(done, sim.vdot, sim.vdotChangedOn, sim.answered, now);
}

/** RC5 as services/fitness.ts calls it: feels after the last change, fatigue confirmed by the mornings left out. */
function proposalAfterFeel(sim: Sim, now: string): Proposal | null {
  const ctx = { lastFeels: sim.feels, cal: sim.cal, sick: sickDays(sim.health, dateOf(now)), settings: sim.p.settings };
  const dates = sim.feels.map((f) => f.date);
  return evaluateFeels(sim.feels, sim.vdot, now, {
    ...(sim.vdotChangedOn ? { lastChange: sim.vdotChangedOn } : {}),
    history: sim.answered,
    fatigueDays: fatigueDays(sim.signals, ctx, dates),
  });
}

/** She accepts every proposal in one tap (RC9). */
function accept(sim: Sim, prop: Proposal, now: string, log: WeekLog): void {
  sim.answered.push({ proposal: prop, decision: "accepted", on: dateOf(now) });
  log.proposals.push({
    on: dateOf(now),
    ruleId: prop.ruleId,
    from: prop.from,
    to: prop.to,
    evidence: prop.evidence.length,
  });
  const r = acceptProposal(state(sim, log.monday), prop, now);
  apply(sim, r);
  if (prop.kind === "vdot") {
    sim.vdot = r.state.vdot;
    sim.vdotChangedOn = dateOf(now);
    sim.provisional = false;
  }
}

// ---------- One day ----------

function morning(sim: Sim, date: string, log: WeekLog): void {
  const p = sim.p;
  // She wakes and syncs her night before her earliest possible run (D1).
  const now = at(date, "06:00");
  const sick = sickWindow(p);
  if (sick?.from === date)
    apply(sim, reportUnavailable(state(sim, log.monday), { reason: "sick", feverOrChest: true }, now));
  if (sick?.better === date) apply(sim, feelBetter(state(sim, log.monday), now));
  sim.signals.push(signalFor(date, dayShift(p, date), sim.next));
  const session = sim.sessions.find((s) => s.status === "planned" && dateOf(s.start) === date) ?? null;
  const ctx = { lastFeels: sim.feels, cal: sim.cal, sick: sickDays(sim.health, date), settings: p.settings };
  const signalsOf = (d: string): SignalId[] =>
    dailySignals(
      sim.signals.find((h) => h.date === d) ?? { date: d },
      sim.signals.filter((h) => h.date < d),
      ctx,
    ).signals;
  const today = signalsOf(date);
  const yesterday = signalsOf(addDays(date, -1));
  const decision = dailyDecision(session, today, yesterday, now);
  if (!session) return;
  let after = session;
  if (decision.action === "easier" || decision.action === "shorter")
    after = changeOptions(state(sim, log.monday), session.id)[decision.action];
  if (!session.manual && sim.health.kind !== "ok") after = adaptForHealth(after, sim.health, date, paces(sim.vdot));
  const changed = after.durMin !== session.durMin || after.type !== session.type;
  log.decisions.push({ date, type: session.type, action: decision.action, signals: today, yesterday, changed });
  if (changed && sim.health.kind === "ok") log.autoChanges++;
  // D7: once decided, the session is frozen for the day.
  sim.sessions = sim.sessions.map((s) => (s.id === session.id ? { ...after, frozen: true } : s));
}

function timetableChange(sim: Sim, date: string, log: WeekLog): void {
  const thursday = addDays(date, 1);
  const added: CalEvent = {
    id: `moved-${thursday}`,
    kind: "class",
    start: at(thursday, "17:00"),
    end: at(thursday, "19:00"),
    manual: false,
  };
  const ics = [...sim.cal.filter((e) => !e.manual && (e.kind === "class" || e.kind === "exam")), added];
  const r = onTimetableChange(state(sim, log.monday), ics, at(date, "08:00"));
  apply(sim, r);
  sim.cal = r.state.cal;
  log.autoChanges += r.changes.filter((c) => c.before?.start !== c.after?.start).length;
}

/** M10 as services/garmin.ts calls it after the sync: the week follows what she ran. */
function adapt(sim: Sim, run: Activity, now: string, log: WeekLog, sessionId?: string): void {
  const r = adaptToRun(state(sim, log.monday), run, now, {
    ...(sessionId ? { sessionId } : {}),
    history: sim.activities,
    hrMax: sim.p.hrMax,
  });
  apply(sim, r);
  log.adaptations.push(
    ...r.changes.map((c) => `${c.ruleId} ${c.before?.type ?? ""} ${c.before?.start.slice(5) ?? ""}`),
  );
}

function sessionTime(sim: Sim, date: string, log: WeekLog, counter: { n: number }): void {
  const s = sim.sessions.find((x) => x.status === "planned" && dateOf(x.start) === date);
  if (!s) {
    const extra = extraRun(sim, date);
    if (!extra) return;
    sim.activities.push(extra);
    log.activities.push(extra);
    adapt(sim, extra, addMin(extra.start, extra.durMin), log);
    return;
  }
  const skip = skips(sim, s, counter.n++);
  if (skip === "explicit") {
    apply(sim, skipSession(state(sim, log.monday), s.id));
    return;
  }
  if (skip === "silent") return;
  const run = runSession(sim, s);
  sim.activities.push(run);
  log.activities.push(run);
  const end = addMin(s.start, run.durMin);
  // Like services/garmin.ts: a run is matched to the planned session of the same day, which becomes done.
  apply(sim, confirmDone(state(sim, log.monday), s.id, end));
  apply(sim, logFeel(state(sim, log.monday), s.id, run.feel ?? "ok", run));
  adapt(sim, run, end, log, s.id);
  const prop = proposalAfterRun(sim, run, end) ?? proposalAfterFeel(sim, end);
  if (prop) accept(sim, prop, end, log);
}

/**
 * Her real level rises with the training she does: research 02 §7.1 (Muñoz 2014: +3.6 to 5 % on 10 km in 10 weeks
 * for recreational runners, ≈ 0.4 % a week), within P19's 7 % ceiling. The stimulus is the share of the plan's volume
 * she ran (capped at 1: more is not better), halved in a build week without a quality run, nil in a week of fever
 * or overreaching. The model is a hypothesis: research 02 notes no study validates a weekly rate by level.
 */
const WEEKLY_GAIN = 0.004;
const GAIN_CEILING = 0.07;

function progress(sim: Sim, log: WeekLog): void {
  const d = sim.p.goal.distanceM;
  if (log.planMin === 0 || log.health.includes("sick") || overreaching(sim.p, log.monday)) return;
  const ran = log.activities.reduce((a, x) => a + x.durMin, 0);
  const build = log.phase.startsWith("dev") || log.phase.startsWith("spe");
  const quality = log.activities.some((a) => readRun(a, paces(sim.truth), sim.p.hrMax).fastMin > 6);
  const stimulus = Math.min(1, ran / log.planMin) * (build && !quality ? 0.5 : 1);
  const best = predictTime(sim.p.trueVdot, d) * (1 - GAIN_CEILING);
  const next = Math.max(best, predictTime(sim.truth, d) * (1 - WEEKLY_GAIN * stimulus));
  sim.truth = vdot(d, next);
}

// ---------- The loop ----------

function build(sim: Sim, monday: string, log: WeekLog): void {
  const now = at(addDays(monday, -1), "18:00");
  const week = inWeek(monday);
  const kept = sim.sessions.filter((s) => week(s) && (s.manual || s.frozen || s.status !== "planned" || s.start < now));
  const plan = planWeek({
    monday,
    now,
    goal: sim.p.goal,
    planStart: PLAN_START,
    settings: sim.p.settings,
    history: sim.activities,
    fitness: { vdot: sim.vdot, provisional: sim.provisional, measuredOn: sim.vdotChangedOn ?? PLAN_START },
    cal: sim.cal,
    kept,
    prev: sim.sessions.filter(inWeek(addDays(monday, -7))),
    health: sim.health,
    signals: sim.signals,
    feels: sim.feels,
  });
  sim.sessions = [...sim.sessions.filter((s) => !week(s)), ...plan.sessions];
  log.built = plan.sessions.map((s) => ({ ...s }));
  log.warnings = plan.warnings.map((w) => w.ruleId);
}

function emptyLog(sim: Sim, w: number, pw: PlanWeek | undefined): WeekLog {
  const monday = weekOf(w);
  return {
    week: w,
    monday,
    planMin: pw?.volumeMin ?? 0,
    phase: pw ? `${pw.phase}${pw.deload ? " (décharge)" : ""}` : monday > sim.p.goal.date ? "après course" : "course",
    built: [],
    final: [],
    activities: [],
    cal: sim.cal.filter(inWeek(monday)),
    vdotStart: sim.vdot,
    vdotEnd: sim.vdot,
    trueVdot: sim.truth,
    decisions: [],
    proposals: [],
    autoChanges: 0,
    adaptations: [],
    warnings: [],
    health: [],
  };
}

export function simulate(p: Persona): RunLog {
  const history = preHistory(p);
  const startNow = at(PLAN_START, "18:00");
  const initial = initialFitness(
    {
      activities: history,
      ...(p.declared ? { declared: p.declared } : {}),
      ...(p.vo2max ? { vo2maxGarmin: p.vo2max } : {}),
      hr: { hrMax: p.hrMax },
    },
    startNow,
  );
  const next = rng(p.id.length * 104729 + p.trueVdot);
  const pre = [...Array(28).keys()].map((k) => signalFor(addDays(PLAN_START, k - 27), {}, next));
  const sim: Sim = {
    p,
    sessions: [],
    activities: [...history],
    cal: calendar(p),
    health: { kind: "ok" },
    feels: [],
    vdot: initial.vdot,
    provisional: initial.status === "provisional",
    answered: [],
    signals: pre,
    next,
    truth: p.trueVdot,
    deviated: new Set(),
  };
  const plan = programPlan({
    now: startNow,
    planStart: PLAN_START,
    goal: p.goal,
    settings: p.settings,
    history,
    fitness: { vdot: sim.vdot },
  });
  const counter = { n: 0 };
  const weeks: WeekLog[] = [];
  for (let w = 1; w <= p.weeks; w++) {
    const monday = weekOf(w);
    const log = emptyLog(
      sim,
      w,
      plan.weeks.find((x) => x.monday === monday),
    );
    build(sim, monday, log);
    for (const date of weekDates(monday)) {
      morning(sim, date, log);
      if (p.script.movedClass?.includes(w) && dayIndex(date) === 2) timetableChange(sim, date, log);
      sessionTime(sim, date, log, counter);
      log.health.push(sim.health.kind);
    }
    log.vdotEnd = sim.vdot;
    // The level she had during the week: the paces were judged against it; training raises the next one.
    log.trueVdot = sim.truth;
    progress(sim, log);
    weeks.push(log);
  }
  for (const log of weeks) log.final = sim.sessions.filter(inWeek(log.monday));
  return {
    persona: p,
    weeks,
    initial,
    history,
    vPeak: plan.vPeak,
    planWeeks: plan.weeks.length,
    feasibility: plan.feasibility.class,
  };
}
