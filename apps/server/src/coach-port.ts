import {
  type FeasibilityClass,
  feasibility,
  initialFitness,
  phaseSplit,
  predictTime,
  totalWeeks,
} from "@talaria/coach";
import type {
  CalendarEvent,
  ChangeOption,
  ChangeOptions,
  DailySignal,
  FeasibilityInput,
  HealthStatus,
  PlannedSession,
  Profile,
  ProfilePatch,
  Program,
  Slot,
  Unavailable,
} from "@talaria/protocol";
import type { Activity } from "./storage/stores.ts";
import { addMinutes } from "./time.ts";

/** What the server hands the algorithm: the current and next week (`WeekState`/`State` in algo.md). */
export type CoachState = {
  sessions: PlannedSession[];
  /** Occurrences in the window, cancelled classes already removed. */
  events: CalendarEvent[];
  settings: Profile;
  program: Program;
  health: HealthStatus;
};

/** A `Change` or `Warning` of algo.md, reduced to what the screen shows. */
export type CoachNote = { ruleId: string; message: string };
/** `refusal` is set when the coach rejects the action (`ok: false` in algo.md): nothing is written. */
export type CoachResult = { state: CoachState; changes: CoachNote[]; warnings: CoachNote[]; refusal?: string };
/** The M5 `dailyDecision` action, with the state where today's session is already lightened. */
export type DailyDecisionResult = CoachResult & { action: "keep" | "easier" | "shorter" | "proposeRest" | "none" };
/**
 * The slice of `@talaria/coach` the server calls, with the signatures of docs/specs/algo.md.
 * Every result is final: the coach has already run `guards.validateWeek` on it.
 */
export interface CoachPort {
  /** Cycle 0.1 `buildWeek` (M2 `weekTemplate` + M4 `placeWeek`): fills the week starting `weekStart`. */
  buildWeek(st: CoachState, weekStart: string, now: string): CoachResult;
  /** M7 `moveSession` (EV1): keeps the content, applies the slot, marks it manual, adapts it if forced. */
  moveSession(st: CoachState, id: string, slot: Slot, now: string): CoachResult;
  /** M4 `proposeMoveSlots`: three best slots with a reason, forbidden ones with theirs. */
  proposeMoveSlots(
    sessionId: string,
    week: CoachState,
    now: string,
  ): { best: { slot: Slot; reason: string }[]; forbidden: { slot: Slot; reason: string }[]; sideEffects: CoachNote[] };
  /** M7 `updateSettings` (EV14): replaces the current and next week, manual sessions kept. */
  updateSettings(st: CoachState, patch: ProfilePatch, now: string): CoachResult;
  /** M7 `onTimetableChange` (EV15): `newEvents` replaces `st.events`, conflicting sessions move. */
  onTimetableChange(st: CoachState, newEvents: CalendarEvent[], now: string): CoachResult;
  /**
   * M5 `readiness` (`baseline`, `dailySignals`, `dailyDecision`) for today's session. `signals` holds
   * the stored days of the last 4 weeks, oldest first, today last when Garmin had it. Never makes a
   * session harder (D9); the server freezes today's session afterwards (D7).
   */
  dailyDecision(st: CoachState, signals: DailySignal[], now: string): DailyDecisionResult;
  /** M7 `changeOptions` (EV2 to EV6): none harder or longer than the planned session. */
  changeOptions(st: CoachState, id: string): ChangeOptions;
  /** M7 `applyChange`: the chosen option replaces the session, marked manual. */
  applyChange(st: CoachState, id: string, option: ChangeOption, now: string): CoachResult;
  /** M7 `reportUnavailable` (EV7 to EV12): sets the health status and adapts the sessions. */
  reportUnavailable(st: CoachState, r: Unavailable, now: string): CoachResult;
  /** M7 `feelBetter` (EV13): lifts a sick, cold or pain status and starts the return. */
  feelBetter(st: CoachState, now: string): CoachResult;
  /**
   * M2 `feasibility` (P19, P20) from F10's starting fitness: the class of the target she typed,
   * null when nothing is known of her form yet (NO_FITNESS_DATA). Never proposes a time.
   */
  feasibility(
    goal: FeasibilityInput,
    history: Activity[],
    vo2maxGarmin: number | undefined,
    now: string,
  ): FeasibilityClass | null;
}

/** Already the real `@talaria/coach`: onboarding needs it before the rest of the coach is wired. */
export function coachFeasibility(
  goal: FeasibilityInput,
  history: Activity[],
  vo2maxGarmin: number | undefined,
  now: string,
): FeasibilityClass | null {
  let fitness: { vdot: number; status: string };
  try {
    fitness = initialFitness({ activities: history, vo2maxGarmin }, now);
  } catch (error) {
    if (error instanceof Error && error.message === "NO_FITNESS_DATA") return null;
    throw error;
  }
  const weeks = totalWeeks(now, goal.date);
  const { taper } = phaseSplit(goal, weeks, false);
  // shortcut: level "regular" for everyone, until onboarding asks for it (P19 rates by level).
  const profile = { level: "regular", runsPerWeek: 3, provisional: fitness.status === "provisional" } as const;
  return feasibility(predictTime(fitness.vdot, goal.distanceM), goal.targetMin, weeks - taper, profile).class;
}

/**
 * shortcut: applies Anna's actions without checking any training rule and never plans anything,
 * until `@talaria/coach` (step 1) is wired in its place.
 */
export const passThroughCoach: CoachPort = {
  buildWeek: (st) => ({ state: st, changes: [], warnings: [] }),
  moveSession: (st, id, slot) => ({
    state: {
      ...st,
      sessions: st.sessions.map((s) => (s.id === id ? { ...s, start: slot.start, manual: true } : s)),
    },
    changes: [],
    warnings: [],
  }),
  proposeMoveSlots: () => ({ best: [], forbidden: [], sideEffects: [] }),
  updateSettings: (st, patch) => ({
    state: { ...st, settings: { ...st.settings, ...patch } },
    changes: [],
    warnings: [],
  }),
  onTimetableChange: (st, newEvents) => ({ state: { ...st, events: newEvents }, changes: [], warnings: [] }),
  dailyDecision: (st) => ({ state: st, changes: [], warnings: [], action: "keep" }),
  changeOptions: (st, id) => {
    const s = st.sessions.find((x) => x.id === id) ?? missing(id);
    const easy = (durMin: number): PlannedSession => ({ ...s, type: "E", durMin, steps: [], rpeTarget: 3 });
    return {
      shorter: { ...s, durMin: Math.round((s.durMin * 0.75) / 5) * 5 },
      easier: easy(s.durMin),
      jog30: easy(Math.min(30, s.durMin)),
    };
  },
  applyChange(st, id, option) {
    const chosen = passThroughCoach.changeOptions(st, id)[option];
    if (!chosen) return { state: st, changes: [], warnings: [], refusal: "Pas de séance équivalente pour celle-ci." };
    return {
      state: { ...st, sessions: st.sessions.map((s) => (s.id === id ? { ...chosen, manual: true } : s)) },
      changes: [],
      warnings: [],
    };
  },
  reportUnavailable: (st, r, now) => ({
    state: { ...st, health: healthAfter(st.health, r, now) },
    changes: [],
    warnings: [],
  }),
  feelBetter: (st) => ({ state: { ...st, health: { kind: "ok" } }, changes: [], warnings: [] }),
  feasibility: coachFeasibility,
};

function missing(id: string): never {
  throw new Error(`Unknown session ${id}`);
}

function healthAfter(health: HealthStatus, r: Unavailable, now: string): HealthStatus {
  const since = now.slice(0, 10);
  if (r.reason === "sick") return r.feverOrChest ? { kind: "sick", since } : { kind: "cold", since };
  if (r.reason === "pain")
    return { kind: "pain", since, level: r.walking0to10, where: r.where, until: r.until, orientationSent: false };
  return health;
}

export function slotFor(session: PlannedSession, start: string): Slot {
  return { start, end: addMinutes(start, session.durMin) };
}
