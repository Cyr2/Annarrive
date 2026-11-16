import type {
  CalendarEvent,
  DailySignal,
  PlannedSession,
  Profile,
  ProfilePatch,
  Program,
  Slot,
} from "@talaria/protocol";
import { addMinutes } from "./time.ts";

/** What the server hands the algorithm: the current and next week (`WeekState`/`State` in algo.md). */
export type CoachState = {
  sessions: PlannedSession[];
  /** Occurrences in the window, cancelled classes already removed. */
  events: CalendarEvent[];
  settings: Profile;
  program: Program;
};

/** A `Change` or `Warning` of algo.md, reduced to what the screen shows. */
export type CoachNote = { ruleId: string; message: string };
export type CoachResult = { state: CoachState; changes: CoachNote[]; warnings: CoachNote[] };
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
};

export function slotFor(session: PlannedSession, start: string): Slot {
  return { start, end: addMinutes(start, session.durMin) };
}
