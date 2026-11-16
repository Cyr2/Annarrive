import { randomUUID } from "node:crypto";
import type {
  CalendarEvent,
  ChangeOption,
  ChangeOptions,
  ChangeResponse,
  CreateEventInput,
  DeleteEventQuery,
  HealthStatus,
  MoveSlots,
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
/** The coach replans the current and the next week (algo.md cycle 0.1). */
const WINDOW_DAYS = 14;

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

  /** "Le cours a lieu finalement", once the Annuler banner is gone. */
  restoreClass(id: string): ChangeResponse {
    const event = this.#event(id);
    if (event.kind !== "class") throw new InvalidInputError("Seuls les cours de l'emploi du temps peuvent être remis.");
    return this.#changeEvent("Cours remis à ta semaine", id, { ...event, cancelled: false });
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

  /** The timetable link moves no session by itself: the refresh that follows does. */
  saveIcsUrl(icsUrl: string): void {
    this.#changes.record("Lien de l'emploi du temps enregistré", [
      { table: "profile", id: CURRENT, after: { id: CURRENT, value: { ...this.profile(), icsUrl } } },
    ]);
  }

  /** EV14: the next weeks follow the new goal, the current week keeps what Anna moved. */
  updateProgram(program: Program): ChangeResponse {
    const before = this.coachState();
    const result = this.#coach.buildWeek({ ...before, program }, this.#nextMonday(), this.#now());
    const write: PlanWrite = { table: "program", id: CURRENT, after: { id: CURRENT, value: program } };
    return this.#commit("Objectif modifié", [write], before, result);
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
   * D1 and D7 of algo.md: once a day, after the night's sleep is in or at 10:00, lets the coach lighten
   * today's session, then freezes it. Returns null when already decided today or nothing is planned.
   */
  morningDecision(): ChangeResponse | null {
    const now = this.#now();
    const today = dateOf(now);
    if (this.#stores.meta.get(MORNING_DECISION)?.value === today) return null;
    const before = this.coachState();
    const session = before.sessions.find((s) => dateOf(s.start) === today && s.status === "planned" && !s.frozen);
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
    };
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
    const healthWrites: PlanWrite[] =
      JSON.stringify(result.state.health) === JSON.stringify(before.health)
        ? []
        : [{ table: "health", id: CURRENT, after: { id: CURRENT, value: result.state.health } }];
    const kept = new Set(result.state.sessions.map((s) => s.id));
    const sessionWrites: PlanWrite[] = [
      ...before.sessions
        .filter((s) => !kept.has(s.id))
        .map((s) => ({ table: "planned_session" as const, id: s.id, after: null })),
      ...result.state.sessions.map((s) => ({ table: "planned_session" as const, id: s.id, after: s })),
    ];
    const moved = movedSessions(before, result).filter(([, s]) => s.id !== movedId).length;
    const fullSummary = moved > 0 ? `${summary} · ${movedRunsText(moved)}` : summary;
    const entry = this.#changes.record(fullSummary, [...writes, ...healthWrites, ...sessionWrites]);
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
