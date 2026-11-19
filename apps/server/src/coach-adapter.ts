import type { CalEvent, Result, Session, Settings, State } from "@annarrive/coach";
import * as coach from "@annarrive/coach";
import {
  agreeWith,
  type CalendarEvent,
  type DailySignal,
  type PlannedSession,
  type Profile,
  type Proposal,
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
  type ProposalDraft,
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

/** S7: without a stated hour, the hour she usually runs at, read from her Garmin runs. */
export function toSettings(p: Profile, runs: { start: string }[]): Settings {
  const preferredHour = p.preferredHour ?? coach.usualHour(runs);
  return {
    runsPerWeek: p.runsPerWeek,
    earliest: p.earliest,
    latestEnd: p.latestEnd,
    noRunDays: p.noRunDays.map(toDay),
    bedtime: p.bedtime,
    useSleepHr: p.useSleepHr,
    travelMin: p.travelMin,
    ...(p.preferredLongDays === undefined ? {} : { preferredLongDays: p.preferredLongDays.map(toDay) }),
    ...(preferredHour === undefined ? {} : { preferredHour }),
  };
}

const inWeek = (monday: string) => (s: { start: string }) =>
  dateOf(s.start) >= monday && dateOf(s.start) < addDays(monday, 7);

/** The coach `State` for the week of `monday`; `all` keeps the other week's sessions as neighbours. */
function toState(st: CoachState, monday: string, all = false): State {
  const sessions = all ? st.sessions : st.sessions.filter(inWeek(monday));
  return {
    monday,
    sessions: sessions.map(toSession),
    cal: st.events.map(toCalEvent),
    settings: toSettings(st.settings, st.activities),
    health: st.health,
    feels: st.feels,
    // Without an estimate no week was ever built, so nothing reads these paces.
    vdot: st.fitness?.vdot ?? 0,
    ...(st.fitness ? { vdotChangedOn: st.fitness.date } : {}),
  };
}

const placed = (sessions: Session[]): PlannedSession[] => sessions.filter((s) => s.start !== "").map(fromSession);

/** The stored morning signals in the coach's shape, oldest first. */
const signalsOf = (st: CoachState): coach.DailySignal[] =>
  (st.signals ?? []).map(({ id, ...rest }: DailySignal) => ({ ...rest, date: id }));

/** The proposals she answered, for RC8: one proposal per rule per 14 days, accepted or declined. */
const answered = (past: Proposal[]): coach.PastProposal[] =>
  past.flatMap((p) =>
    p.status !== "pending" && p.decidedOn
      ? [
          {
            proposal: p,
            decision: p.status === "accepted" ? ("accepted" as const) : ("refused" as const),
            on: p.decidedOn,
          },
        ]
      : [],
  );

/** Each run with the type of the session it was matched to: interval laps are never read as one effort (F18). */
const withPlannedType = (st: CoachState): (Activity & Pick<coach.Activity, "plannedType">)[] =>
  st.activities.map((a) => {
    const type = st.sessions.find((s) => s.id === a.sessionId)?.type;
    return type ? { ...a, plannedType: type } : a;
  });

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
    return coach.initialFitness(fitnessHistory(withPlannedType(st), vo2max, st.program.declaredTime), now);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_FITNESS_DATA") return null;
    throw error;
  }
}

/** The run behind an F10 proposal, so the card can name it: « ton 11 km du 11 novembre ». */
function withProof(p: coach.Proposal, activities: Activity[]): ProposalDraft {
  const id = /^effort:([^:]+:[^:]+)/.exec(p.evidence[0] ?? "")?.[1];
  const run = activities.find((a) => a.id === id);
  const proof = run && { date: dateOf(run.start), distanceM: run.distM, thresholdSKm: coach.paces(p.to).T };
  return proof ? { ...p, proof } : p;
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

/** « ton seuil », « ta sortie longue ». */
const yours = (type: PlannedSession["type"]): string =>
  `${agreeWith(type, "") ? "ta" : "ton"} ${sessionNames[type].toLowerCase()}`;
const dayName = (iso: string): string => coach.DAY_NAMES[coach.weekday(iso)] ?? "";

/** What she did, said plainly: a footing that was a tempo, a run she added, a run longer than planned. */
function leadOf(a: coach.Adaptation, run: Activity, planned: PlannedSession | undefined): string {
  const what = planned
    ? `${yours(planned.type)} de ${dayName(run.start)}`
    : `ta course en plus de ${dayName(run.start)}`;
  const What = what.charAt(0).toUpperCase() + what.slice(1);
  if (a.changes.some((c) => c.ruleId === "AD3")) {
    const kind = a.reading.intervalMin > a.reading.fastMin / 2 ? "un fractionné" : "un tempo";
    return planned ? `${What} ressemblait plutôt à ${kind}` : `${What} était rapide`;
  }
  if (!planned) return `${What} compte dans ta semaine`;
  return `${What} était plus ${agreeWith(planned.type, "") ? "longue" : "long"} que prévu`;
}

/** One line for Aujourd'hui: « Ton footing de mardi ressemblait plutôt à un tempo : je décale ton seuil à jeudi. » */
function adaptationNote(a: coach.Adaptation, run: Activity, planned: PlannedSession | undefined): string {
  const actions = a.changes.flatMap((c) => {
    const { before, after } = c;
    if (!before || !after) return [];
    if (c.ruleId === "AD4") return [`je raccourcis ${yours(before.type)} de ${dayName(before.start)}`];
    return after.start !== before.start
      ? [`je décale ${yours(before.type)} à ${dayName(after.start)}`]
      : [`${yours(before.type)} de ${dayName(before.start)} passe en footing`];
  });
  return `${leadOf(a, run, planned)} : ${actions.join(" et ")}.`;
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
      settings: toSettings(st.settings, st.activities),
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
    // Only automatic sessions after today are rebuilt: what Anna touched, ran or missed stays, and today too (P25).
    const kept = st.sessions.filter(
      (s) => week(s) && (s.manual || s.frozen || s.status !== "planned" || dateOf(s.start) <= dateOf(now)),
    );
    const plan = coach.planWeek({
      monday: weekStart,
      now,
      goal: st.program.goal,
      ...(st.program.startedOn ? { planStart: st.program.startedOn } : {}),
      settings: toSettings(st.settings, st.activities),
      // The planned type tells a test she ran (P26) from any run.
      history: withPlannedType(st),
      fitness: {
        vdot: st.fitness.vdot,
        provisional: st.fitness.provisional === true,
        measuredOn: st.fitness.date,
      },
      cal: st.events.map(toCalEvent),
      kept: kept.map(toSession),
      // S9: the week before keeps each run on its day; P9, EV9: fatigue and illness shape the new week.
      prev: st.sessions.filter(inWeek(addDays(weekStart, -7))).map(toSession),
      health: st.health,
      signals: signalsOf(st),
      feels: st.feels,
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
    return perWeek(st, now, (w) => coach.updateSettings(w, toSettings(settings, st.activities), now), { settings });
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
    const ctx = { lastFeels: st.feels, cal: week.cal, sick: coach.sickDays(st.health, today), settings: week.settings };
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
    // EV9 to EV12 advise and never block: while unwell, the session she may run is the adapted one. A cold already
    // shortened every session ahead when she said it (EV10): shortening again would halve it twice.
    if (!session.manual && st.health.kind !== "ok" && st.health.kind !== "cold")
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

  evaluateRun(st, run, past, now) {
    const fitness = st.fitness;
    if (!fitness) return null;
    const history = answered(past);
    const reread = () => {
      const measured = initialFitness(st, undefined, now);
      const riseOnly = !fitness.provisional;
      const p = measured && coach.proposeMeasured(fitness.vdot, measured, now, { riseOnly, history });
      return p && withProof(p, st.activities);
    };
    if (fitness.provisional) return reread();
    const ctx = {
      hrMax: hrMaxOf(st.activities) ?? Number.POSITIVE_INFINITY,
      now,
      illnessLast14d: st.health.kind === "sick",
    };
    // A level F10 measured on its own (not one she accepted) rises with a better reading (F10, RC11).
    return coach.evaluateRace(run, fitness.vdot, ctx) ?? (fitness.source.startsWith("effort:") ? reread() : null);
  },

  evaluateKeySessions(st, done, past, now) {
    if (!st.fitness || st.fitness.provisional) return null;
    const keys = done.map(({ session, activity }) => keySession(session, activity));
    return coach.evaluateKeySessions(keys, st.fitness.vdot, st.fitness.date, answered(past), now);
  },

  evaluateFeels(st, past, now) {
    if (!st.fitness) return null;
    const today = dateOf(now);
    const ctx = {
      lastFeels: st.feels,
      cal: st.events.map(toCalEvent),
      sick: coach.sickDays(st.health, today),
      settings: toSettings(st.settings, st.activities),
    };
    const fatigueDays = coach.fatigueDays(
      signalsOf(st),
      ctx,
      st.feels.map((f) => f.date),
    );
    return coach.evaluateFeels(st.feels, st.fitness.vdot, now, {
      lastChange: st.fitness.date,
      history: answered(past),
      fatigueDays,
    });
  },

  evaluateTrends(st, past, now) {
    return st.fitness ? coach.evaluateTrends(signalsOf(st), now, answered(past)) : null;
  },

  adaptToRun(st, run, now) {
    if (!st.fitness) return { state: st, changes: [], warnings: [] };
    const planned = st.sessions.find((s) => s.id === run.sessionId);
    const hrMax = hrMaxOf(st.activities);
    const r = coach.adaptToRun(toState(st, mondayOf(dateOf(run.start)), true), run, now, {
      ...(planned ? { sessionId: planned.id } : {}),
      history: st.activities,
      ...(hrMax === undefined ? {} : { hrMax }),
    });
    if (r.changes.length === 0) return { state: st, changes: [], warnings: [] };
    const until = r.changes
      .map((c) => dateOf(c.after?.start ?? now))
      .sort()
      .at(-1);
    return { ...fromResult(st, r, now), note: adaptationNote(r, run, planned), ...(until ? { until } : {}) };
  },

  readFeel(session, run, vdot) {
    // shortcut: pace only, the heart rate of a lap is not read here (AD1 reads it on the week's adaptation).
    const ratio = coach.paceRatio(toSession(session), run);
    return {
      rpeDone: coach.readRun(run, coach.paces(vdot)).rpe,
      ...(ratio === undefined ? {} : { paceRatio: ratio }),
    };
  },

  repace(st, now) {
    if (!st.fitness) return { state: st, changes: [], warnings: [] };
    const v = st.fitness.vdot;
    const same: coach.Proposal = { kind: "vdot", from: v, to: v, ruleId: "F10", evidence: [], expiresOn: dateOf(now) };
    return fromResult(st, coach.acceptProposal(toState(st, mondayOf(dateOf(now)), true), same, now), now);
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
