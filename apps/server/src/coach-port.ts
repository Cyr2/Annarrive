import {
  type FeasibilityClass,
  type FitnessHistory,
  feasibility,
  hrMax,
  initialFitness,
  type Phase,
  phaseSplit,
  predictTime,
  totalWeeks,
} from "@annarrive/coach";
import type {
  CalendarEvent,
  ChangeOption,
  ChangeOptions,
  DailySignal,
  DeclaredTime,
  FeasibilityInput,
  HealthStatus,
  PlannedSession,
  Profile,
  ProfilePatch,
  Program,
  Proposal,
  Slot,
  TargetOdds,
  Unavailable,
} from "@annarrive/protocol";
import type { Activity, FitnessEstimate } from "./storage/stores.ts";
import { addMinutes } from "./time.ts";

/** What the server hands the algorithm: the current and next week (`WeekState`/`State` in algo.md). */
export type CoachState = {
  sessions: PlannedSession[];
  /** Occurrences in the window, cancelled classes already removed. */
  events: CalendarEvent[];
  settings: Profile;
  program: Program;
  health: HealthStatus;
  /** Stored runs of the last year: volumes of the plan (M2), spike caps (G1) and fitness (M1). */
  activities: Activity[];
  /** Latest estimate, null until the first one. */
  fitness: FitnessEstimate | null;
  /** Feel answers of the last two weeks, with the RPE the session aimed for (SG4). */
  feels: { sessionId: string; date: string; feel: "easy" | "ok" | "hard"; rpeTarget: number }[];
  /** Morning signals of the last five weeks, oldest first: confirmed fatigue (P9, RC5) and Garmin VO2max (RC7). */
  signals?: DailySignal[];
};

/** A level change as the coach proposes it, before the server stores it. */
export type ProposalDraft = Omit<Proposal, "id" | "status" | "decidedOn">;

/** The programme the weeks follow (M2): week 1's Monday, the phases in order, and P19 on her target. */
export type ProgramPlan = {
  firstMonday: string;
  phases: { phase: Phase; weeks: number }[];
  feasibility: FeasibilityClass;
  odds: TargetOdds;
};

/** A `Change` or `Warning` of algo.md, reduced to what the screen shows; a change names its session. */
export type CoachNote = { ruleId: string; message: string; sessionId?: string };
/** `refusal` is set when the coach rejects the action (`ok: false` in algo.md): nothing is written. */
export type CoachResult = { state: CoachState; changes: CoachNote[]; warnings: CoachNote[]; refusal?: string };
/** The M5 `dailyDecision` action, with the state where today's session is already lightened. */
export type DailyDecisionResult = CoachResult & {
  action: "keep" | "easier" | "shorter" | "proposeRest" | "none";
  /** The signals that made the morning check lighten the session, in words (« nuit courte et cœur au repos plus haut »). */
  why?: string;
};
/**
 * The slice of `@annarrive/coach` the server calls, with the signatures of docs/specs/algo.md.
 * Every result is final: the coach has already run `guards.validateWeek` on it.
 * The last four methods have no counterpart in the first port: the server needs them to bootstrap
 * fitness, recalibrate (M8) and time the morning decision (D1) without holding any rule itself.
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
  /**
   * M7 `onTimetableChange` (EV15): `newEvents` replaces `st.events`, conflicting sessions move. `own`: an event
   * Anna placed caused it, so a run within 12 h moves too (EV22).
   */
  onTimetableChange(st: CoachState, newEvents: CalendarEvent[], now: string, own?: boolean): CoachResult;
  /** M7 `confirmDone` (EV21): « Oui, je l'ai faite » for a session no synced run matched. */
  confirmDone(st: CoachState, id: string, now: string): CoachResult;
  /** M7 `skipSession` (EV21): « Passer cette séance », never made up. */
  skipSession(st: CoachState, id: string, now: string): CoachResult;
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
  /** M5 `decisionDue` (D1): after the night's sleep, else at 10:00 or 2 h before the session, whichever is first. */
  decisionDue(now: string, sessionStart: string | null, nightSynced: boolean): boolean;
  /** M1 `initialFitness` (F10): history first, then Garmin VO2max or the declared time; null when nothing is known. */
  estimateFitness(st: CoachState, vo2max: number | undefined, now: string): Omit<FitnessEstimate, "id" | "date"> | null;
  /** M8 after a new run: RC1 and RC2 for a race or test, F10 while the level is provisional. */
  evaluateRun(st: CoachState, run: Activity, now: string): ProposalDraft | null;
  /**
   * M8 RC3 and RC4 after a T, CRUISE or I session: its laps against the targets of the key sessions since the last
   * level change, with the proposals she already answered (RC8).
   */
  evaluateKeySessions(
    st: CoachState,
    done: { session: PlannedSession; activity: Activity }[],
    past: Proposal[],
    now: string,
  ): ProposalDraft | null;
  /**
   * M8 RC5 after a feel answer: three "hard" in a row on easy sessions since the last level change propose a test,
   * unless the mornings confirmed fatigue on those days; once per 14 days (RC8).
   */
  evaluateFeels(st: CoachState, past: Proposal[], now: string): ProposalDraft | null;
  /** M8 RC7 after a run: Garmin VO2max shifted by 2 for 14 days proposes a test, once per 14 days. */
  evaluateTrends(st: CoachState, past: Proposal[], now: string): ProposalDraft | null;
  /** M8 `acceptProposal` (RC9): new paces for future sessions, and the new estimate in `state.fitness`. */
  acceptProposal(st: CoachState, proposal: ProposalDraft, now: string): CoachResult;
  /**
   * M2 `feasibility` (P19, P20) from F10's starting fitness: the class of the target she typed,
   * null when nothing is known of her form yet (NO_FITNESS_DATA). Never proposes a time.
   */
  /** M2 `generatePlan` as `buildWeek` runs it; null without a goal or a known level. */
  programPlan(st: CoachState, now: string): ProgramPlan | null;
  feasibility(
    goal: FeasibilityInput,
    history: Activity[],
    vo2maxGarmin: number | undefined,
    now: string,
  ): FeasibilityClass | null;
}

export function slotFor(session: PlannedSession, start: string): Slot {
  return { start, end: addMinutes(start, session.durMin) };
}

/** M1 `initialFitness`'s input from what is stored: runs with their laps, the observed HRmax (F12), her last time. */
export function fitnessHistory(
  activities: Activity[],
  vo2maxGarmin: number | undefined,
  declared: DeclaredTime | undefined,
): FitnessHistory {
  const observed = activities.flatMap((a) => (a.maxHr === undefined ? [] : [a.maxHr]));
  const max = observed.length ? hrMax(Math.max(...observed), undefined)?.value : undefined;
  return {
    activities,
    ...(vo2maxGarmin === undefined ? {} : { vo2maxGarmin }),
    ...(declared
      ? {
          declared: {
            distM: declared.distanceM,
            tMin: declared.minutes,
            ...(declared.date ? { date: declared.date } : {}),
          },
        }
      : {}),
    ...(max === undefined ? {} : { hr: { hrMax: max } }),
  };
}

/** Already the real `@annarrive/coach`: onboarding needs it before the rest of the coach is wired. */
export function coachFeasibility(
  goal: FeasibilityInput,
  history: Activity[],
  vo2maxGarmin: number | undefined,
  now: string,
): FeasibilityClass | null {
  let fitness: { vdot: number; status: string };
  try {
    fitness = initialFitness(fitnessHistory(history, vo2maxGarmin, goal.declaredTime), now);
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
