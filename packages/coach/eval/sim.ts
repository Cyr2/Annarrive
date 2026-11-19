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
  reportUnavailable,
  type Session,
  type SignalId,
  type State,
  type Step,
  sickDays,
  skipSession,
  speedForVo2,
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
function effectiveVdot(p: Persona, date: string): number {
  const sick = sickWindow(p);
  const afterSick = sick !== null && date >= sick.from && daysBetween(sick.from, date) <= 14 ? 1 : 0;
  return p.trueVdot - (overreaching(p, date) ? 1.5 : 0) - afterSick;
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

/** One lap per repetition, as a structured Garmin workout records it. Slower than the target when she cannot hold it. */
function stepLaps(sim: Sim, st: Step, day: string, allOut: boolean): { laps: Lap[]; ratio: number } {
  const p = sim.p;
  const appE = paces(sim.vdot).E;
  const zone: PaceZone = st.kind === "strides" ? "R" : (st.zone ?? "E");
  const target = speed(mid(st.target.paceSKm, appE));
  // A test is run all out for its duration, whatever its target pace (F10, catalogue TEST): F2 at her level.
  const eff = effectiveVdot(p, day);
  const can = allOut ? speedForVo2(eff * fractionF(st.durMin)) : trueSpeed(p, zone, eff);
  const eager = allOut ? 1 : (p.script.eagerness ?? 0.2);
  const v = (can < target ? can : target + eager * (can - target)) * (1 + (sim.next() - 0.5) * 0.02);
  const hr = (allOut ? ALL_OUT_HR : HR_SHARE[zone] + (overreaching(p, day) ? 0.02 : 0)) * p.hrMax;
  const laps = [...Array(st.reps ?? 1).keys()].map(() => ({ durMin: st.durMin, distM: v * st.durMin, avgHr: hr }));
  return { laps, ratio: can / target };
}

function runSession(sim: Sim, s: Session): Activity {
  const laps: Lap[] = [];
  let hardest = { ratio: 1, rpe: 0 };
  for (const st of s.steps) {
    const out = stepLaps(sim, st, dateOf(s.start), s.type === "TEST" && st.kind === "work");
    laps.push(...out.laps);
    if (st.target.rpe > hardest.rpe && st.kind === "work") hardest = { ratio: out.ratio, rpe: st.target.rpe };
  }
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
    feel: feelOf(sim, s, hardest.ratio),
  };
}

function feelOf(sim: Sim, s: Session, ratio: number): Activity["feel"] {
  if (overreaching(sim.p, dateOf(s.start))) return "hard";
  if (!isHard(s) || s.type === "L") return (sim.p.script.eagerness ?? 0) >= 1 ? "easy" : "ok";
  return ratio >= 1.04 ? "easy" : ratio < 0.98 ? "hard" : "ok";
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

function sessionTime(sim: Sim, date: string, log: WeekLog, counter: { n: number }): void {
  const s = sim.sessions.find((x) => x.status === "planned" && dateOf(x.start) === date);
  if (!s) return;
  const skip = skips(sim, s, counter.n++);
  if (skip === "explicit") {
    apply(sim, skipSession(state(sim, log.monday), s.id));
    return;
  }
  if (skip === "silent") return;
  const run = runSession(sim, s);
  sim.activities.push(run);
  log.activities.push(run);
  const end = addMin(s.start, s.durMin);
  // Like services/garmin.ts: a run is matched to the planned session of the same day, which becomes done.
  apply(sim, confirmDone(state(sim, log.monday), s.id, end));
  apply(sim, logFeel(state(sim, log.monday), s.id, run.feel ?? "ok"));
  const prop = proposalAfterRun(sim, run, end) ?? proposalAfterFeel(sim, end);
  if (prop) accept(sim, prop, end, log);
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
    fitness: { vdot: sim.vdot, provisional: sim.provisional },
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
    trueVdot: sim.p.trueVdot,
    decisions: [],
    proposals: [],
    autoChanges: 0,
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
    weeks.push(log);
  }
  for (const log of weeks) log.final = sim.sessions.filter(inWeek(log.monday));
  return { persona: p, weeks, initial, history, vPeak: plan.vPeak, planWeeks: plan.weeks.length };
}
