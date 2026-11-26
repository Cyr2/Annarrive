/** Shared types of the coach (docs/specs/algo.md §1.1). Literal values the spec writes in its type blocks are kept as is. */

export type RunType =
  | "E"
  | "RECUP"
  | "L"
  | "T"
  | "CRUISE"
  | "I"
  | "R"
  | "SPE"
  | "FARTLEK"
  | "TEST"
  /** The goal race itself, on its date (P24). */
  | "RACE";
export type Phase = "base" | "dev" | "spe" | "taper";
/** Which pace a step follows, so new paces can be applied after a recalibration (RC9). "race" keeps its own target. */
export type PaceZone = "E" | "M" | "T" | "I" | "R" | "race";
export type Feel = "easy" | "ok" | "hard";

export type Step = {
  kind: "warmup" | "work" | "recover" | "cooldown" | "strides";
  /** Duration of one repetition. */
  durMin: number;
  distM?: number;
  reps?: number;
  zone?: PaceZone;
  target: { paceSKm?: [number, number]; hrBpm?: [number, number]; rpe: number };
};

export type Session = {
  id: string;
  type: RunType;
  /** Local ISO "YYYY-MM-DDTHH:mm", "" while not placed. */
  start: string;
  durMin: number;
  steps: Step[];
  rpeTarget: number;
  priority: 1 | 2 | 3 | 4 | 5;
  status: "planned" | "done" | "missed" | "skipped" | "cancelled";
  manual: boolean;
  frozen: boolean;
  pilot: "pace" | "hr" | "rpe";
};

export type CalEvent = {
  id: string;
  kind: "class" | "exam" | "strength" | "revision" | "unavailable" | "work";
  start: string;
  end: string;
  /** Strength: a legs session (H5, H6). Work: physical work, on her feet (H6). */
  legs?: boolean;
  light?: boolean;
  manual: boolean;
};

/** S7: her usual start on weekdays, at the weekend and for her long run, "HH:mm". */
export type UsualHours = { weekday?: string; weekend?: string; long?: string };

/** Days are numbered 0 = Monday to 6 = Sunday. Times are "HH:mm". */
export type Settings = {
  runsPerWeek: 3 | 4 | 5;
  earliest: string;
  latestEnd: string;
  noRunDays: number[];
  bedtime: string;
  /** Days the long run may go on (S8), 0 = Monday. */
  preferredLongDays?: number[];
  preferredHour?: string;
  /** S7 without a stated hour: the hours she usually runs at, read from her runs (`usualHours`). */
  usualHours?: UsualHours;
  useSleepHr: boolean;
  travelMin: number;
};

export type GoalDistance = 5000 | 10000 | 21097.5 | 42195;
/** `startTime` "HH:mm": when the race starts (P24). */
export type Goal = { distanceM: GoalDistance; date: string; targetMin?: number; startTime?: string } | null;

export type DailySignal = {
  date: string;
  rhr?: number;
  sleepMin?: number;
  bodyBatteryWake?: number;
  stressAvg?: number;
  vo2max?: number;
};

export type Activity = {
  id: string;
  start: string;
  durMin: number;
  distM: number;
  avgHr?: number;
  hrSeries?: number[];
  elevGainM?: number;
  isRace?: boolean;
  isTest?: boolean;
  tempC?: number;
  feel?: Feel;
  /** Garmin laps (auto-lap 1 km by default), in order: where the best sustained efforts are found (F18). */
  laps?: Lap[];
  /** Type of the planned session the run was matched to: interval laps are never read as one effort (F18). */
  plannedType?: RunType;
};

export type Lap = { durMin: number; distM: number; avgHr?: number };

export type Proposal = {
  kind: "vdot" | "test" | "goal";
  from: number;
  to: number;
  ruleId: string;
  evidence: string[];
  expiresOn: string;
};

export type Paces = { E: number; M: number; T: number; I: number; R: number };

export type Change = { ruleId: string; sessionId?: string; before?: Session; after?: Session; detail?: string };
export type Warning = { ruleId: string; message: string; sessionId?: string };

export type Slot = { start: string; end: string };
export type Violation = { ruleId: string; message: string };

export type WeekState = {
  /** Monday of the week, "YYYY-MM-DD". */
  monday: string;
  sessions: Session[];
  cal: CalEvent[];
  settings: Settings;
  /** Sessions of the previous week, for S9. */
  prev?: Session[];
};

export type FeelLog = {
  sessionId: string;
  date: string;
  feel: Feel;
  rpeTarget: number;
  /** RPE of the run as she ran it (AD1): a tempo run on an easy day is not an easy run felt hard (SG4, RC5). */
  rpeDone?: number;
  /** Her speed over the session's target speed (RC13). */
  paceRatio?: number;
};

export type PainSite = "mollet" | "genou" | "cheville" | "hanche" | "pied" | "autre";
export type Health =
  | { kind: "ok" }
  | { kind: "sick"; since: string }
  | { kind: "cold"; since: string }
  | { kind: "pain"; since: string; level: number; where: PainSite; until?: string; orientationSent: boolean }
  /**
   * After feeling better from a fever (EV9): short easy runs before `easyUntil`, then longer ones, Q one notch easier
   * before `qEasierUntil`. `since`: first day of the fever (B1).
   */
  | { kind: "recovering"; easyUntil: string; qEasierUntil: string; since?: string }
  /** After a cold (EV13): easy running only before `easyUntil`, then the usual plan. */
  | { kind: "easy"; easyUntil: string };

export type State = WeekState & {
  health: Health;
  feels: FeelLog[];
  vdot: number;
  /** Date of the last accepted pace change (RC3). */
  vdotChangedOn?: string;
};

export type MoveProposal = { sessionId: string; slots: SlotWithReason[] };
/** `reason` is the short French line the Déplacer sheet shows under the slot (A6). */
export type SlotWithReason = { slot: Slot; penalty: number; reason: string };

export type Result = {
  ok: boolean;
  state: State;
  /** State before the action, for Undo. */
  previous: State;
  changes: Change[];
  warnings: Warning[];
  proposals?: MoveProposal[];
  /** What Anna may run (or ride) today if she wants to despite the advice (EV9 to EV12). */
  options?: { jog?: Session; bikeMin?: number };
  banner?: string;
};
