import { randomUUID } from "node:crypto";
import type {
  CalendarEvent,
  ChangeOption,
  ChangeOptions,
  ChangeResponse,
  CreateEventInput,
  DeleteEventQuery,
  Feasibility,
  FeasibilityInput,
  HealthStatus,
  MoveSlots,
  OnboardingStatus,
  PlannedSession,
  Profile,
  ProfilePatch,
  Program,
  Today,
  Unavailable,
  UpdateEventInput,
  Week,
} from "@talaria/protocol";
import { type CoachPort, type CoachResult, type CoachState, type DailyDecisionResult, slotFor } from "../coach-port.ts";
import { InvalidInputError, NotFoundError, ReadOnlyError } from "../errors.ts";
import { watchStatus } from "../garmin/workout.ts";
import type { Stores } from "../storage/stores.ts";
import { addDays, type Clock, dateOf, frenchMoment, isoWeekStart, mondayOf, toParisLocal } from "../time.ts";
import { afterDelete, occurrences } from "./calendar.ts";
import type { ChangeService, PlanWrite } from "./changes.ts";
import type { NotificationService } from "./notifications.ts";

/** Defaults of algo.md section 4.2, used until onboarding stores a profile. */
export const defaultProfile: Profile = {
  runsPerWeek: 3,
  earliest: "07:00",
  latestEnd: "21:30",
  noRunDays: [],
  bedtime: "23:00",
  useSleepHr: true,
  travelMin: 0,
  cycleTracking: false,
};

const eventLabels: Record<CalendarEvent["kind"], string> = {
  class: "Cours",
  exam: "Examen",
  strength: "Muscu",
  revision: "Révision",
  unavailable: "Indispo",
};

const changeLabels: Record<ChangeOption, string> = {
  shorter: "Séance raccourcie",
  easier: "Séance passée en allure facile",
  equivalent: "Séance remplacée par une équivalente",
  jog30: "Séance remplacée par un footing tranquille",
};

const unavailableLabels: Record<Unavailable["reason"], string> = {
  no_time: "Pas le temps : séance passée",
  tired: "Fatiguée : repos aujourd'hui",
  sick: "Malade : séances adaptées",
  pain: "Douleur notée : séances adaptées",
};

/** What Reggie reads before answering about form or health. */
export type RecentData = {
  health: HealthStatus;
  signals: { id: string; rhr?: number; sleepMin?: number; bodyBatteryWake?: number; stressAvg?: number }[];
  activities: { id: string; start: string; durMin: number; distM: number; avgHr?: number; feel?: string }[];
};

const CURRENT = "current";
/** How far back Reggie looks at signals and runs. */
const RECENT_DAYS = 14;
/** F10 looks for an effort in the last 12 weeks. */
const EFFORT_DAYS = 84;
/** The coach replans the current and the next week (algo.md cycle 0.1). */
const WINDOW_DAYS = 14;
/** Runs the coach reads: a year of volumes (P8) and efforts (F10). */
const HISTORY_DAYS = 365;
/** How old a Garmin VO2max may be to stand in for a level (F10 c). */
const FITNESS_DAYS = 30;

const MORNING_DECISION = "morning.decidedOn";
const decisionSummaries: Record<DailyDecisionResult["action"], string> = {
  keep: "Séance du jour confirmée",
  none: "Séance du jour confirmée",
  easier: "Séance du jour allégée",
  shorter: "Séance du jour raccourcie",
  proposeRest: "Repos proposé aujourd'hui",
};

export function movedRunsText(count: number): string {
  return count === 1 ? "1 course déplacée" : `${count} courses déplacées`;
}

/** Pairs [before, after] of the sessions the coach gave a new start. */
function movedSessions(before: CoachState, result: CoachResult): [PlannedSession, PlannedSession][] {
  return result.state.sessions.flatMap((s) => {
    const old = before.sessions.find((b) => b.id === s.id);
    return old && old.start !== s.start ? [[old, s]] : [];
  });
}

export class PlanService {
  readonly #stores: Stores;
  readonly #changes: ChangeService;
  readonly #coach: CoachPort;
  readonly #clock: Clock;
  readonly #notifications: NotificationService;

  constructor(
    stores: Stores,
    changes: ChangeService,
    coach: CoachPort,
    clock: Clock,
    notifications: NotificationService,
  ) {
    this.#stores = stores;
    this.#changes = changes;
    this.#coach = coach;
    this.#clock = clock;
    this.#notifications = notifications;
  }

  profile(): Profile {
    return this.#stores.profile.get(CURRENT)?.value ?? defaultProfile;
  }

  program(): Program {
    return this.#stores.program.get(CURRENT)?.value ?? { goal: null };
  }

  /** Onboarding stores the profile last, so a stored profile means it went through. */
  onboarding(): OnboardingStatus {
    return { done: this.#stores.profile.get(CURRENT) !== undefined };
  }

  /** P19: the coach's five classes shown as two, so a bold target never reads as a refusal. */
  feasibility(goal: FeasibilityInput): Feasibility {
    const now = this.#now();
    const from = addDays(dateOf(now), -EFFORT_DAYS);
    const history = this.#stores.activity.overlapping(`${from}T00:00`, now);
    const vo2max = this.#stores.dailySignal
      .overlapping(from, now)
      .map((s) => s.vo2max)
      .findLast((v) => v !== undefined);
    const cls = this.#coach.feasibility(goal, history, vo2max, now);
    if (cls === null || cls === "sans-cible") return { verdict: null };
    return { verdict: cls === "ambitieux" || cls === "irréaliste" ? "ambitieux" : "atteignable" };
  }

  today(): Today {
    const date = dateOf(this.#now());
    const day = this.#days(date, 1)[0];
    return { date, session: day?.sessions[0] ?? null, events: day?.events ?? [] };
  }

  week(isoWeek: string): Week {
    const monday = isoWeekStart(isoWeek);
    return { week: isoWeek, readOnly: addDays(monday, 7) <= dateOf(this.#now()), days: this.#days(monday, 7) };
  }

  createEvent(input: CreateEventInput): ChangeResponse {
    const event: CalendarEvent = {
      ...input,
      id: randomUUID(),
      legs: input.kind === "strength" ? (input.legs ?? true) : undefined,
      manual: true,
      cancelled: false,
      exceptions: [],
    };
    return this.#changeEvent(`${eventLabels[event.kind]} ajoutée`, event.id, event);
  }

  updateEvent(id: string, patch: UpdateEventInput): ChangeResponse {
    const event = this.#editableEvent(id);
    const updated = { ...event, ...patch };
    if (updated.end <= updated.start) throw new InvalidInputError("La fin doit venir après le début.");
    return this.#changeEvent(`${eventLabels[event.kind]} modifiée`, id, updated);
  }

  deleteEvent(id: string, query: DeleteEventQuery): ChangeResponse {
    const event = this.#editableEvent(id);
    return this.#changeEvent(`${eventLabels[event.kind]} supprimée`, id, afterDelete(event, query));
  }

  /** "Ce cours n'a pas lieu": the class stays stored and survives the next sync, its slot is freed. */
  cancelClass(id: string): ChangeResponse {
    const event = this.#event(id);
    if (event.kind !== "class")
      throw new InvalidInputError("Seuls les cours de l'emploi du temps peuvent être marqués annulés.");
    return this.#changeEvent("Cours marqué « n'a pas lieu »", id, { ...event, cancelled: true });
  }

  moveSession(id: string, start: string): ChangeResponse {
    const before = this.coachState();
    const session = this.#upcoming(before, id);
    const now = this.#now();
    if (start < now) throw new InvalidInputError("Ce moment est déjà passé : choisis un créneau à venir.");
    if (dateOf(start) >= addDays(mondayOf(dateOf(now)), WINDOW_DAYS)) {
      throw new InvalidInputError(
        "Une séance se déplace dans cette semaine ou la suivante : choisis un jour plus proche.",
      );
    }
    const result = this.#coach.moveSession(before, id, slotFor(session, start), now);
    return this.#commit(`Séance déplacée à ${frenchMoment(start)}`, [], before, result, id);
  }

  proposeMoveSlots(id: string): MoveSlots {
    const state = this.coachState();
    if (!state.sessions.some((s) => s.id === id))
      throw new NotFoundError("Cette séance est introuvable : recharge l'écran.");
    const proposal = this.#coach.proposeMoveSlots(id, state, this.#now());
    return { ...proposal, sideEffects: proposal.sideEffects.map((n) => n.message) };
  }

  changeOptions(id: string): ChangeOptions {
    const state = this.coachState();
    this.#upcoming(state, id);
    return this.#coach.changeOptions(state, id);
  }

  changeSession(id: string, option: ChangeOption): ChangeResponse {
    const before = this.coachState();
    this.#upcoming(before, id);
    const result = this.#coach.applyChange(before, id, option, this.#now());
    return this.#commit(changeLabels[option], [], before, result);
  }

  reportUnavailable(report: Unavailable): ChangeResponse {
    const before = this.coachState();
    const result = this.#coach.reportUnavailable(before, report, this.#now());
    return this.#commit(unavailableLabels[report.reason], [], before, result);
  }

  feelBetter(): ChangeResponse {
    const before = this.coachState();
    return this.#commit("Retour progressif lancé", [], before, this.#coach.feelBetter(before, this.#now()));
  }

  health(): HealthStatus {
    return this.#stores.health.get(CURRENT)?.value ?? { kind: "ok" };
  }

  recent(): RecentData {
    const to = this.#now();
    const from = addDays(dateOf(to), -RECENT_DAYS);
    return {
      health: this.health(),
      signals: this.#stores.dailySignal.overlapping(from, to),
      activities: this.#stores.activity
        .overlapping(`${from}T00:00`, to)
        .map(({ hrSeries: _hr, ...activity }) => activity),
    };
  }

  updateProfile(patch: ProfilePatch): ChangeResponse {
    const before = this.coachState();
    const result = this.#coach.updateSettings(before, patch, this.#now());
    const write: PlanWrite = {
      table: "profile",
      id: CURRENT,
      after: { id: CURRENT, value: { ...before.settings, ...patch } },
    };
    return this.#commit("Réglages enregistrés", [write], before, result);
  }

  /**
   * EV14: the plan restarts from the new goal, this week included (what Anna moved stays), and the level
   * is estimated first if still unknown or provisional. Without a goal (MA8) the current week stays.
   */
  updateProgram(input: Program): ChangeResponse {
    const before = this.coachState();
    const today = dateOf(this.#now());
    const sameGoal = JSON.stringify(input.goal) === JSON.stringify(before.program.goal);
    const program = { ...input, startedOn: sameGoal ? (before.program.startedOn ?? today) : today };
    const write: PlanWrite = { table: "program", id: CURRENT, after: { id: CURRENT, value: program } };
    return this.#rebuild("Objectif modifié", [write], { ...before, program }, before, program.goal !== null);
  }

  /** After a run, when no level was known yet: estimates it and builds the weeks it was missing. */
  bootstrapFitness(): ChangeResponse | null {
    const before = this.coachState();
    const fitness = before.fitness ? null : this.#estimate(before);
    return fitness && this.#rebuild("Niveau estimé", [], { ...before, fitness }, before, true);
  }

  /** Lets FitnessService record an accepted proposal like any other change. */
  commitResult(summary: string, writes: PlanWrite[], before: CoachState, result: CoachResult): ChangeResponse {
    return this.#commit(summary, writes, before, result);
  }

  #rebuild(summary: string, writes: PlanWrite[], state: CoachState, before: CoachState, thisWeek: boolean) {
    const now = this.#now();
    const fitness = state.fitness?.provisional === false ? state.fitness : (this.#estimate(state) ?? state.fitness);
    const current = thisWeek
      ? this.#coach.buildWeek({ ...state, fitness }, this.#windowStart(), now)
      : { state: { ...state, fitness }, warnings: [] };
    const next = this.#coach.buildWeek(current.state, this.#nextMonday(), now);
    const warnings = [...current.warnings, ...next.warnings].filter(
      (w, i, all) => all.findIndex((x) => x.message === w.message) === i,
    );
    return this.#commit(summary, writes, before, { ...next, warnings });
  }

  /** F10 from what is stored: Garmin runs, the latest Garmin VO2max, the declared time. */
  #estimate(state: CoachState): CoachState["fitness"] {
    const now = this.#now();
    const vo2max = this.#stores.dailySignal
      .overlapping(addDays(dateOf(now), -FITNESS_DAYS), addDays(dateOf(now), 1))
      .findLast((d) => d.vo2max !== undefined)?.vo2max;
    const guess = this.#coach.estimateFitness(state, vo2max, now);
    return guess && { ...guess, id: dateOf(now), date: dateOf(now) };
  }

  /** Sunday 18:00 job (algo.md cycle 0.1). */
  async buildNextWeek(): Promise<ChangeResponse> {
    const before = this.coachState();
    const response = this.#commit(
      "Ta semaine est prête",
      [],
      before,
      this.#coach.buildWeek(before, this.#nextMonday(), this.#now()),
    );
    if (response.change) await this.#notifications.weekReady();
    return response;
  }

  /** After a timetable sync already rewrote the classes: lets the coach move what now conflicts, and tells Anna. */
  async replanAfterTimetable(before: CoachState, summary: string): Promise<ChangeResponse> {
    const result = this.#coach.onTimetableChange(before, this.#windowEvents(), this.#now());
    const response = this.#commit(summary, [], before, result);
    for (const [old, moved] of movedSessions(before, result)) await this.#notifications.runMoved(old, moved);
    return response;
  }

  /**
   * D1 and D7 of algo.md: once a day, after the night's sleep is in, else at 10:00 or 2 h before the session, lets the coach lighten
   * today's session, then freezes it. Returns null when already decided today or nothing is planned.
   */
  morningDecision(): ChangeResponse | null {
    const now = this.#now();
    const today = dateOf(now);
    if (this.#stores.meta.get(MORNING_DECISION)?.value === today) return null;
    const before = this.coachState();
    const session = before.sessions.find((s) => dateOf(s.start) === today && s.status === "planned" && !s.frozen);
    const nightSynced = this.#stores.dailySignal.get(today)?.sleepMin !== undefined;
    if (!this.#coach.decisionDue(now, session?.start ?? null, nightSynced)) return null;
    let response: ChangeResponse | null = null;
    if (session) {
      const signals = this.#stores.dailySignal.overlapping(addDays(today, -29), addDays(today, 1));
      const result = this.#coach.dailyDecision(before, signals, now);
      const sessions = result.state.sessions.map((s) => (s.id === session.id ? { ...s, frozen: true } : s));
      response = this.#commit(decisionSummaries[result.action], [], before, {
        ...result,
        state: { ...result.state, sessions },
      });
    }
    this.#stores.meta.put({ id: MORNING_DECISION, value: today });
    return response;
  }

  /** A Garmin run matched this session: it is done, and Annuler can still reopen it. */
  markDone(id: string): void {
    const session = this.#stores.plannedSession.get(id);
    if (session)
      this.#changes.record("Course synchronisée", [
        { table: "planned_session", id, after: { ...session, status: "done" } },
      ]);
  }

  coachState(): CoachState {
    const from = this.#windowStart();
    const to = addDays(from, WINDOW_DAYS);
    return {
      sessions: this.#stores.plannedSession.overlapping(`${from}T00:00`, `${to}T00:00`),
      events: this.#windowEvents(),
      settings: this.profile(),
      program: this.program(),
      health: this.health(),
      activities: this.#stores.activity.overlapping(`${addDays(from, -HISTORY_DAYS)}T00:00`, this.#now()),
      fitness: this.#stores.fitnessEstimate.list().at(-1) ?? null,
      feels: this.#feels(),
    };
  }

  /** Feel answers of the runs matched to a session, for SG4. */
  #feels(): CoachState["feels"] {
    const today = dateOf(this.#now());
    return this.#stores.activity.overlapping(`${addDays(today, -RECENT_DAYS)}T00:00`, this.#now()).flatMap((a) => {
      const session = a.sessionId ? this.#stores.plannedSession.get(a.sessionId) : undefined;
      return a.feel && session
        ? [{ sessionId: session.id, date: dateOf(session.start), feel: a.feel, rpeTarget: session.rpeTarget }]
        : [];
    });
  }

  #upcoming(state: CoachState, id: string): PlannedSession {
    const session = state.sessions.find((s) => s.id === id);
    if (!session)
      throw new NotFoundError("Cette séance est introuvable dans cette semaine ou la suivante : recharge l'écran.");
    if (session.status !== "planned") throw new ReadOnlyError("Cette séance n'est plus à venir : elle ne change plus.");
    return session;
  }

  #changeEvent(summary: string, id: string, after: CalendarEvent | null): ChangeResponse {
    const before = this.coachState();
    const result = this.#coach.onTimetableChange(before, this.#windowEvents({ id, after }), this.#now());
    return this.#commit(summary, [{ table: "calendar_event", id, after }], before, result);
  }

  /** Records the trigger writes and every session the coach changed as one undoable change. */
  #commit(
    summary: string,
    writes: PlanWrite[],
    before: CoachState,
    result: CoachResult,
    movedId?: string,
  ): ChangeResponse {
    if (result.refusal) throw new InvalidInputError(result.refusal);
    const stateWrites: PlanWrite[] =
      JSON.stringify(result.state.health) === JSON.stringify(before.health)
        ? []
        : [{ table: "health", id: CURRENT, after: { id: CURRENT, value: result.state.health } }];
    const fitness = result.state.fitness;
    if (fitness && JSON.stringify(fitness) !== JSON.stringify(before.fitness))
      stateWrites.push({ table: "fitness_estimate", id: fitness.id, after: fitness });
    const kept = new Set(result.state.sessions.map((s) => s.id));
    const sessionWrites: PlanWrite[] = [
      ...before.sessions
        .filter((s) => !kept.has(s.id))
        .map((s) => ({ table: "planned_session" as const, id: s.id, after: null })),
      ...result.state.sessions.map((s) => ({ table: "planned_session" as const, id: s.id, after: s })),
    ];
    const moved = movedSessions(before, result).filter(([, s]) => s.id !== movedId).length;
    const fullSummary = moved > 0 ? `${summary} · ${movedRunsText(moved)}` : summary;
    const entry = this.#changes.record(fullSummary, [...writes, ...stateWrites, ...sessionWrites]);
    return {
      change: entry && { id: entry.id, summary: entry.summary },
      warnings: result.warnings.map((w) => w.message),
    };
  }

  /** Occurrences in the coach window, without cancelled classes, optionally with one event replaced. */
  #windowEvents(override?: { id: string; after: CalendarEvent | null }): CalendarEvent[] {
    const from = this.#windowStart();
    const to = addDays(from, WINDOW_DAYS);
    const stored = this.#stores.calendarEvent.overlapping(`${from}T00:00`, `${to}T00:00`);
    const events = override ? stored.filter((e) => e.id !== override.id) : stored;
    if (override?.after) events.push(override.after);
    return events
      .flatMap((e) => occurrences(e, from, to))
      .filter((e) => !e.cancelled)
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  #days(from: string, count: number): Week["days"] {
    const to = addDays(from, count);
    const today = dateOf(this.#now());
    const sessions = this.#stores.plannedSession
      .overlapping(`${from}T00:00`, `${to}T00:00`)
      .map((s) => ({ ...s, watch: watchStatus(s, this.#stores.watchSync.get(s.id), today) }));
    const events = this.#stores.calendarEvent
      .overlapping(`${from}T00:00`, `${to}T00:00`)
      .flatMap((e) => occurrences(e, from, to))
      .sort((a, b) => a.start.localeCompare(b.start));
    return Array.from({ length: count }, (_, i) => {
      const date = addDays(from, i);
      return {
        date,
        sessions: sessions.filter((s) => dateOf(s.start) === date),
        events: events.filter((e) => dateOf(e.start) === date),
      };
    });
  }

  #event(id: string): CalendarEvent {
    const event = this.#stores.calendarEvent.get(id);
    if (!event) throw new NotFoundError("Cet événement est introuvable : recharge l'écran.");
    return event;
  }

  #editableEvent(id: string): CalendarEvent {
    const event = this.#event(id);
    if (!event.manual) {
      throw new ReadOnlyError(
        "Les cours viennent de ton emploi du temps : tu peux seulement les marquer « n'a pas lieu ».",
      );
    }
    return event;
  }

  #now(): string {
    return toParisLocal(this.#clock());
  }

  #windowStart(): string {
    return mondayOf(dateOf(this.#now()));
  }

  #nextMonday(): string {
    return addDays(this.#windowStart(), 7);
  }
}
