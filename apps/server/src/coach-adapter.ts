import type { CalEvent, Result, Session, Settings, State } from "@annarrive/coach";
import * as coach from "@annarrive/coach";
import {
  type CalendarEvent,
  type DailySignal,
  type PlannedSession,
  type Profile,
  sessionNames,
} from "@annarrive/protocol";
import {
  type CoachNote,
  type CoachPort,
  type CoachResult,
  type CoachState,
  coachFeasibility,
  type DailyDecisionResult,
  fitnessHistory,
} from "./coach-port.ts";
import type { Activity } from "./storage/stores.ts";
import { addDays, dateOf, mondayOf } from "./time.ts";

// ---------- Shapes: the stored documents on one side, the coach types on the other ----------

/** Stored steps may lack a duration or an RPE; the coach reads the session's own target then. */
export const toSession = (p: PlannedSession): Session => ({
  ...p,
  steps: p.steps.map((st) => ({
    ...st,
    durMin: st.durMin ?? 0,
    target: { ...st.target, rpe: st.target.rpe ?? p.rpeTarget },
  })),
});

const fromSession = (s: Session): PlannedSession => ({
  ...s,
  steps: s.steps.map((st) => ({ ...st, durMin: st.durMin > 0 ? st.durMin : undefined })),
});

/** One id per occurrence: a weekly class is one stored event but several slots, and EV15 diffs by id. */
const toCalEvent = (e: CalendarEvent): CalEvent => ({
  id: `${e.id}@${dateOf(e.start)}`,
  kind: e.kind,
  start: e.start,
  end: e.end,
  manual: e.manual,
  ...(e.legs === undefined ? {} : { legs: e.legs }),
});

/** The app numbers days 1 (Monday) to 7, the coach 0 to 6. */
const toDay = (d: number): number => d - 1;

export const toSettings = (p: Profile): Settings => ({
  runsPerWeek: p.runsPerWeek,
  earliest: p.earliest,
  latestEnd: p.latestEnd,
  noRunDays: p.noRunDays.map(toDay),
  bedtime: p.bedtime,
  useSleepHr: p.useSleepHr,
  travelMin: p.travelMin,
  ...(p.preferredLongDays === undefined ? {} : { preferredLongDays: p.preferredLongDays.map(toDay) }),
  ...(p.preferredHour === undefined ? {} : { preferredHour: p.preferredHour }),
});

const inWeek = (monday: string) => (s: { start: string }) =>
  dateOf(s.start) >= monday && dateOf(s.start) < addDays(monday, 7);

/** The coach `State` for the week of `monday`; `all` keeps the other week's sessions as neighbours. */
function toState(st: CoachState, monday: string, all = false): State {
  const sessions = all ? st.sessions : st.sessions.filter(inWeek(monday));
  return {
    monday,
    sessions: sessions.map(toSession),
    cal: st.events.map(toCalEvent),
    settings: toSettings(st.settings),
    health: st.health,
    feels: st.feels,
    // Without an estimate no week was ever built, so nothing reads these paces.
    vdot: st.fitness?.vdot ?? 0,
    ...(st.fitness ? { vdotChangedOn: st.fitness.date } : {}),
  };
}

const placed = (sessions: Session[]): PlannedSession[] => sessions.filter((s) => s.start !== "").map(fromSession);

const mondays = (now: string): string[] => {
  const monday = mondayOf(dateOf(now));
  return [monday, addDays(monday, 7)];
};

// ---------- Results ----------

/** "Sortie longue de mardi". */
function sessionName(r: Result, id: string): string {
  const s = r.state.sessions.find((x) => x.id === id);
  return s ? `${sessionNames[s.type]} de ${coach.DAY_NAMES[coach.weekday(s.start)]}` : "Une séance proche";
}

const toNotes = (r: Result): { changes: CoachNote[]; warnings: CoachNote[] } => ({
  changes: r.changes.map((c) => ({
    ruleId: c.ruleId,
    message: c.detail ?? "",
    ...(c.sessionId ? { sessionId: c.sessionId } : {}),
  })),
  warnings: [
    ...r.warnings.map((w) => ({ ruleId: w.ruleId, message: w.message })),
    // H9: a session starting within 12 h is never moved without her say.
    ...(r.proposals ?? []).map((p) => ({
      ruleId: "H9",
      message: `${sessionName(r, p.sessionId)} tombe sur un créneau pris : choisis un autre moment ou passe cette séance.`,
    })),
  ],
});

/** G8 on each week of the result: what breaks a rule and was not already said becomes a warning. */
function validated(result: CoachResult, now: string): CoachResult {
  const said = new Set(result.warnings.map((w) => w.ruleId));
  const extra: CoachNote[] = [];
  for (const monday of mondays(now)) {
    const week = toState(result.state, monday);
    for (const v of coach.validateWeek(week).violations) {
      if (said.has(v.ruleId)) continue;
      said.add(v.ruleId);
      const s = week.sessions.find((x) => x.id === v.sessionId);
      const hard = s && coach.checkHard(s, coach.slotOf(s), week).find((h) => h.ruleId === v.ruleId);
      extra.push({ ruleId: v.ruleId, message: hard ? hard.message : "Cette semaine dépasse une règle du plan" });
    }
  }
  return { ...result, warnings: [...result.warnings, ...extra] };
}

function fromResult(st: CoachState, r: Result, now: string, extra: Partial<CoachState> = {}): CoachResult {
  if (r.changes.length === 0 && r.warnings[0] && r.state === r.previous)
    return { state: st, changes: [], warnings: [], refusal: r.warnings[0].message };
  const state = { ...st, ...extra, sessions: placed(r.state.sessions), health: r.state.health };
  return validated({ state, ...toNotes(r) }, now);
}

/** Runs a replanning action on each week of the window, since the coach places one week at a time. */
function perWeek(st: CoachState, now: string, run: (week: State) => Result, extra: Partial<CoachState>): CoachResult {
  const sessions: PlannedSession[] = [];
  const notes = { changes: [] as CoachNote[], warnings: [] as CoachNote[] };
  for (const monday of mondays(now)) {
    const r = run(toState(st, monday));
    sessions.push(...placed(r.state.sessions));
    const n = toNotes(r);
    notes.changes.push(...n.changes);
    notes.warnings.push(...n.warnings);
  }
  return validated({ state: { ...st, ...extra, sessions }, ...notes }, now);
}

// ---------- Fitness ----------

const hrMaxOf = (activities: Activity[]): number | undefined => {
  const observed = activities.flatMap((a) => (a.maxHr === undefined ? [] : [a.maxHr]));
  return observed.length ? coach.hrMax(Math.max(...observed), undefined)?.value : undefined;
};

function initialFitness(st: CoachState, vo2max: number | undefined, now: string): coach.InitialFitness | null {
  try {
    return coach.initialFitness(fitnessHistory(st.activities, vo2max, st.program.declaredTime), now);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_FITNESS_DATA") return null;
    throw error;
  }
}

/**
 * RC3's input: each lap's speed over the work step's target speed. Warm-up and recovery laps fall under 90 % and
 * are left out by the coach; her own feel stands in for Garmin's when the watch did not ask.
 */
function keySession(session: PlannedSession, activity: Activity): coach.KeySession {
  const pace = session.steps.find((s) => s.kind === "work")?.target.paceSKm;
  const target = pace ? 2000 / (pace[0] + pace[1]) : 0;
  const fractions = target ? (activity.laps ?? []).map((l) => l.distM / (l.durMin * 60) / target) : [];
  const feel = activity.feel ?? activity.answeredFeel;
  return { session: toSession(session), activity: { ...activity, ...(feel ? { feel } : {}) }, fractions };
}

const NO_FITNESS =
  "Reggie a besoin de ton niveau pour préparer ta semaine : indique un chrono récent ou cours avec ta montre.";
const SIGNAL_WORDS: Record<string, string> = {
  SG1: "cœur au repos plus haut que d'habitude",
  SG2: "nuit courte",
  SG3: "récupération basse sur ta montre",
  SG4: "ta dernière séance facile t'a paru dure",
  SG5: "un examen aujourd'hui ou demain",
};

/** « nuit courte et cœur au repos plus haut que d'habitude »: what the morning check saw, for Anna. */
function whyText(signals: string[]): string {
  const words = signals.flatMap((id) => SIGNAL_WORDS[id] ?? []);
  const last = words.pop();
  return words.length > 0 ? `${words.join(", ")} et ${last}` : (last ?? "");
}

/** The real `CoachPort`: translates the stored shapes and lets `@annarrive/coach` decide everything. */
export const coachAdapter: CoachPort = {
  feasibility: coachFeasibility,
  programPlan(st, now) {
    const { goal } = st.program;
    if (!goal || !st.fitness) return null;
    const plan = coach.programPlan({
      now,
      goal,
      ...(st.program.startedOn ? { planStart: st.program.startedOn } : {}),
      settings: toSettings(st.settings),
      history: st.activities,
      fitness: { vdot: st.fitness.vdot, provisional: st.fitness.provisional === true },
    });
    const first = plan.weeks[0];
    if (!first) return null;
    const { base, dev, spe, taper } = plan.split;
    // The week the programme starts in runs plan week 1 too when a day is left after the start day (P25): it
    // counts as the first base week, so the next one reads « Semaine 2 ».
    const start = st.program.startedOn ?? dateOf(now);
    const startMonday = mondayOf(start);
    const early = addDays(start, 1) < first.monday ? 1 : 0;
    return {
      firstMonday: early ? startMonday : first.monday,
      phases: [
        { phase: "base", weeks: base + early },
        { phase: "dev", weeks: dev },
        { phase: "spe", weeks: spe },
        { phase: "taper", weeks: taper },
      ],
      feasibility: plan.feasibility.class,
      odds: {
        currentMin: coach.predictTime(st.fitness.vdot, goal.distanceM),
        weeks: base + dev + spe,
        gain: plan.feasibility.gain,
        gainMax: plan.feasibility.gainMax,
      },
    };
  },
  buildWeek(st, weekStart, now) {
    if (!st.fitness) return { state: st, changes: [], warnings: [{ ruleId: "F10", message: NO_FITNESS }] };
    const week = inWeek(weekStart);
    // Only automatic sessions still ahead are rebuilt: what Anna touched, ran or missed stays.
    const kept = st.sessions.filter(
      (s) => week(s) && (s.manual || s.frozen || s.status !== "planned" || s.start < now),
    );
    const plan = coach.planWeek({
      monday: weekStart,
      now,
      goal: st.program.goal,
      ...(st.program.startedOn ? { planStart: st.program.startedOn } : {}),
      settings: toSettings(st.settings),
      history: st.activities,
      fitness: { vdot: st.fitness.vdot, provisional: st.fitness.provisional === true },
      cal: st.events.map(toCalEvent),
      kept: kept.map(toSession),
    });
    const sessions = [...st.sessions.filter((s) => !week(s)), ...placed(plan.sessions)];
    return validated({ state: { ...st, sessions }, changes: [], warnings: plan.warnings }, now);
  },

  moveSession(st, id, slot, now) {
    return fromResult(st, coach.moveSession(toState(st, mondayOf(dateOf(slot.start)), true), id, slot, now), now);
  },

  proposeMoveSlots(sessionId, st, now) {
    const session = st.sessions.find((s) => s.id === sessionId);
    const monday = mondayOf(dateOf(session?.start ?? now));
    const r = coach.proposeMoveSlots(sessionId, toState(st, monday, true), now);
    return {
      best: r.best.map((b) => ({ slot: b.slot, reason: b.reason })),
      forbidden: r.forbidden,
      // A6: a valid slot never forces another run to move.
      sideEffects: [],
    };
  },

  updateSettings(st, patch, now) {
    const settings = { ...st.settings, ...patch };
    return perWeek(st, now, (w) => coach.updateSettings(w, toSettings(settings), now), { settings });
  },

  onTimetableChange(st, newEvents, now, own = false) {
    // EV15 diffs the imported classes; the events Anna placed are taken as they now are.
    const imported = (e: CalEvent) => !e.manual && (e.kind === "class" || e.kind === "exam");
    const next = newEvents.map(toCalEvent);
    const run = (w: State) =>
      coach.onTimetableChange(
        { ...w, cal: [...w.cal.filter(imported), ...next.filter((e) => !imported(e))] },
        next.filter(imported),
        now,
        own,
      );
    return perWeek(st, now, run, { events: newEvents });
  },

  dailyDecision(st, signals, now) {
    const today = dateOf(now);
    const week = toState(st, mondayOf(today), true);
    const session = week.sessions.find((s) => s.status === "planned" && dateOf(s.start) === today) ?? null;
    const history = signals.map(({ id, ...rest }: DailySignal) => ({ ...rest, date: id }));
    const ctx = { lastFeels: st.feels, cal: week.cal, sick: [], settings: week.settings };
    const signalsOf = (date: string) =>
      coach.dailySignals(
        history.find((h) => h.date === date) ?? { date },
        history.filter((h) => h.date < date),
        ctx,
      ).signals;
    const yesterday = addDays(today, -1);
    const decision = coach.dailyDecision(
      session,
      signalsOf(today),
      history.some((h) => h.date === yesterday) ? signalsOf(yesterday) : null,
      now,
    );
    const why = whyText(signalsOf(today));
    const done = (state: CoachState, warnings: CoachNote[] = []): DailyDecisionResult => ({
      ...validated({ state, changes: [], warnings }, now),
      action: decision.action,
      why,
    });
    if (!session) return done(st);
    let after = session;
    if (decision.action === "easier" || decision.action === "shorter")
      after = coach.changeOptions(week, session.id)[decision.action];
    // EV9 to EV12 advise and never block: while unwell, the session she may run is the adapted one.
    if (!session.manual && st.health.kind !== "ok")
      after = coach.adaptForHealth(after, st.health, today, coach.paces(week.vdot));
    const sessions = st.sessions.map((s) => (s.id === session.id ? fromSession(after) : s));
    const warnings =
      decision.action === "proposeRest" ? [{ ruleId: "D5", message: `Repos conseillé aujourd'hui : ${why}.` }] : [];
    return done({ ...st, sessions }, warnings);
  },

  changeOptions(st, id) {
    const session = st.sessions.find((s) => s.id === id);
    if (!session) throw new Error(`Unknown session ${id}`);
    const o = coach.changeOptions(toState(st, mondayOf(dateOf(session.start)), true), id);
    return {
      shorter: fromSession(o.shorter),
      easier: fromSession(o.easier),
      jog30: fromSession(o.jog30),
      ...(o.equivalent ? { equivalent: fromSession(o.equivalent) } : {}),
    };
  },

  applyChange(st, id, option, now) {
    const r = coach.applyChange(toState(st, mondayOf(dateOf(now)), true), id, option, now);
    return fromResult(st, r, now);
  },

  reportUnavailable(st, report, now) {
    const r = coach.reportUnavailable(toState(st, mondayOf(dateOf(now)), true), report, now);
    const jog = r.options?.jog;
    // If she runs anyway, the watch must carry the adapted run (EV9 to EV12).
    const state = jog ? { ...r.state, sessions: r.state.sessions.map((s) => (s.id === jog.id ? jog : s)) } : r.state;
    return fromResult(st, { ...r, state }, now);
  },

  confirmDone(st, id, now) {
    return fromResult(st, coach.confirmDone(toState(st, mondayOf(dateOf(now)), true), id, now), now);
  },

  skipSession(st, id, now) {
    return fromResult(st, coach.skipSession(toState(st, mondayOf(dateOf(now)), true), id), now);
  },

  feelBetter(st, now) {
    return fromResult(st, coach.feelBetter(toState(st, mondayOf(dateOf(now)), true), now), now);
  },

  decisionDue: (now, sessionStart, nightSynced) => coach.decisionDue(now, sessionStart, nightSynced),

  estimateFitness(st, vo2max, now) {
    const f = initialFitness(st, vo2max, now);
    return f && { vdot: f.vdot, source: f.source, provisional: f.status === "provisional" };
  },

  evaluateRun(st, run, now) {
    if (!st.fitness) return null;
    if (st.fitness.provisional) {
      const measured = initialFitness(st, undefined, now);
      return measured && coach.proposeMeasured(st.fitness.vdot, measured, now);
    }
    const ctx = {
      hrMax: hrMaxOf(st.activities) ?? Number.POSITIVE_INFINITY,
      now,
      illnessLast14d: st.health.kind === "sick",
    };
    return coach.evaluateRace(run, st.fitness.vdot, ctx);
  },

  evaluateKeySessions(st, done, past, now) {
    if (!st.fitness || st.fitness.provisional) return null;
    const keys = done.map(({ session, activity }) => keySession(session, activity));
    const history = past.flatMap((p): coach.PastProposal[] =>
      p.status === "declined" && p.decidedOn ? [{ proposal: p, decision: "refused", on: p.decidedOn }] : [],
    );
    return coach.evaluateKeySessions(keys, st.fitness.vdot, st.fitness.date, history, now);
  },

  evaluateFeels(st, now) {
    return st.fitness ? coach.evaluateFeels(st.feels, st.fitness.vdot, now) : null;
  },

  acceptProposal(st, proposal, now) {
    const r = coach.acceptProposal(toState(st, mondayOf(dateOf(now)), true), proposal, now);
    const today = dateOf(now);
    const fitness =
      proposal.kind === "vdot"
        ? { id: today, date: today, vdot: r.state.vdot, source: `proposal:${proposal.ruleId}`, provisional: false }
        : st.fitness;
    return fromResult(st, r, now, { fitness });
  },
};
