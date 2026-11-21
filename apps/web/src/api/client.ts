import type { ChatContext } from "@annarrive/protocol";
import type {
  CalendarEvent,
  ChangeOption,
  ChangeOptionId,
  ChangeResult,
  ChangeRow,
  ChatEvent,
  ChatMessage,
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

export type GoalInput = {
  race: string;
  distanceKm: number;
  date: string;
  targetTime?: string;
  startTime?: string;
  /** Her own name for the race; shown in place of the distance. */
  name?: string;
};

export type ChatInput = { text: string; context?: ChatContext };
/** One day of the conversation, and the day before it that has messages (absent when none). */
export type ChatDay = { day: string; messages: ChatMessage[]; earlier?: string };

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
  /** `date`: the occurrence tapped, so "one" skips only that day of a recurring event. */
  deleteEvent(id: string, scope: DeleteScope, date?: string): Promise<ChangeResult>;
  saveStrength(template: Strength, existing?: boolean): Promise<ChangeResult>;
  /** "one" is this week only, "all" this week and the following ones, from `date`. */
  deleteStrength(id: string, scope: DeleteScope, date?: string): Promise<ChangeResult>;

  moveOptions(id: string): Promise<MoveOptions>;
  /** A run by default; a strength, revision or busy slot when `event` is given. */
  move(id: string, slot: Slot, event?: CalendarEvent): Promise<ChangeResult>;
  changeOptions(sessionId: string): Promise<ChangeOption[]>;
  change(sessionId: string, option: ChangeOptionId): Promise<ChangeResult>;
  previewUnavailable(input: UnavailableInput): Promise<ChangeRow[]>;
  unavailable(input: UnavailableInput): Promise<ChangeResult>;
  /** « Passer cette séance » or « Non, je l'ai sautée »: skipped, never made up. */
  skip(sessionId: string): Promise<ChangeResult>;
  /** « Oui, je l'ai faite » when no synced run matched the session. */
  confirmDone(sessionId: string): Promise<ChangeResult>;
  /** "Ça va mieux": easy runs 3 more days, then back to normal. */
  feelBetter(): Promise<ChangeResult>;
  undo(changeId: string): Promise<void>;
  acceptProposal(id: string): Promise<ChangeResult>;
  declineProposal(id: string): Promise<ChangeResult>;

  refreshTimetable(): Promise<RefreshResult>;
  /** Saves the ICS link, then reads it at once. */
  setTimetableUrl(url: string): Promise<RefreshResult>;
  updateSettings(patch: Partial<Settings>): Promise<ChangeResult>;
  updateGoal(goal: GoalInput): Promise<ChangeResult>;
  /** « Ton dernier chrono »: her paces are recomputed with it. */
  updateLastTime(time: NonNullable<Program["lastTime"]>): Promise<ChangeResult>;
  stopProgram(): Promise<ChangeResult>;
  /** « Fermer le bilan »: the server keeps it closed for that ISO week, on every device. */
  dismissReview(week: string): Promise<void>;
  /** « Garder la forme » after the goal race: no goal, two easy weeks, then maintenance. */
  keepFit(): Promise<ChangeResult>;
  reconnectWatch(): Promise<void>;
  resendToWatch(sessionId: string): Promise<void>;
  logFeel(activityId: string, feel: Feel): Promise<void>;

  /** Reggie answers as a stream: status updates ("Je vérifie"), then messages (an id seen again replaces it). */
  chat(input: ChatInput): AsyncIterable<ChatEvent>;
  /** Today without `day`. */
  chatHistory(day?: string): Promise<ChatDay>;

  /** Null when the server has no VAPID keys: the notifications switch then stays hidden. */
  pushKey(): Promise<string | null>;
  /** `PushSubscription.toJSON()`, validated before it leaves. */
  subscribePush(subscription: unknown): Promise<void>;
  unsubscribePush(endpoint: string): Promise<void>;
}
