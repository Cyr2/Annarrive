import type {
  CalendarEvent,
  ChangeOption,
  ChangeOptionId,
  ChangeResult,
  ChangeRow,
  ChatEvent,
  Feel,
  MoveOptions,
  Program,
  RefreshResult,
  Settings,
  Slot,
  Strength,
  Today,
  Week,
} from "./schemas.ts";

export type NewEvent = Omit<CalendarEvent, "id" | "cancelled" | "templateId"> & {
  repeat?: Strength["repeat"];
};
export type EventPatch = Partial<Pick<CalendarEvent, "date" | "start" | "end" | "title" | "cancelled">>;
export type DeleteScope = "one" | "all";

export type UnavailableReason = "time" | "tired" | "sick" | "pain" | "other";
export type UnavailableInput = {
  sessionId: string;
  reason: Exclude<UnavailableReason, "time" | "other">;
  fever?: boolean;
  zone?: string;
  pain?: number;
  /** Last day included, or undefined for today only. */
  until?: string;
};

export type GoalInput = { race: string; distanceKm: number; date: string; targetTime?: string };

export type ChatInput = { text: string; context?: string };

/**
 * Everything the screens ask the server. The HTTP client and the in-memory mock both implement it,
 * so the real server plugs in without touching a screen. Each change returns the id that Annuler needs.
 */
export interface Api {
  readonly mode: "server" | "mock";
  today(): Promise<Today>;
  week(offset: number): Promise<Week>;
  program(): Promise<Program>;

  addEvent(input: NewEvent): Promise<ChangeResult>;
  updateEvent(id: string, patch: EventPatch): Promise<ChangeResult>;
  deleteEvent(id: string, scope: DeleteScope): Promise<ChangeResult>;
  saveStrength(template: Strength): Promise<ChangeResult>;
  deleteStrength(id: string, scope: DeleteScope): Promise<ChangeResult>;

  moveOptions(id: string): Promise<MoveOptions>;
  move(id: string, slot: Slot): Promise<ChangeResult>;
  changeOptions(sessionId: string): Promise<ChangeOption[]>;
  change(sessionId: string, option: ChangeOptionId): Promise<ChangeResult>;
  previewUnavailable(input: UnavailableInput): Promise<ChangeRow[]>;
  unavailable(input: UnavailableInput): Promise<ChangeResult>;
  skip(sessionId: string): Promise<ChangeResult>;
  undo(changeId: string): Promise<void>;

  refreshTimetable(): Promise<RefreshResult>;
  updateSettings(patch: Partial<Settings>): Promise<ChangeResult>;
  updateGoal(goal: GoalInput): Promise<ChangeResult>;
  stopProgram(): Promise<ChangeResult>;
  reconnectWatch(): Promise<void>;
  resendToWatch(sessionId: string): Promise<void>;
  logFeel(activityId: string, feel: Feel): Promise<void>;

  /** Reggie answers as a stream: status updates ("Je vérifie"), then messages. */
  chat(input: ChatInput): AsyncIterable<ChatEvent>;
}
