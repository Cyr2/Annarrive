import type { DatabaseSync } from "node:sqlite";
import {
  type CalendarEvent,
  calendarEventSchema,
  localDateSchema,
  localDateTimeSchema,
  plannedSessionSchema,
  profileSchema,
  programSchema,
} from "@talaria/protocol";
import { z } from "zod";
import { addMinutes } from "../time.ts";
import { DocumentStore } from "./store.ts";

/** Tables a plan change can touch, so the change log can restore them. */
export const planTables = ["planned_session", "calendar_event", "profile", "program"] as const;
export type PlanTable = (typeof planTables)[number];

export const changeEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  summary: z.string(),
  mutations: z.array(z.object({ table: z.enum(planTables), id: z.string(), before: z.unknown(), after: z.unknown() })),
  undoneAt: z.string().optional(),
});
export type ChangeEntry = z.infer<typeof changeEntrySchema>;

// Shaped like `Activity` and `DailySignal` in docs/specs/algo.md; filled by the Garmin step.
const activitySchema = z.object({
  id: z.string(),
  start: localDateTimeSchema,
  durMin: z.number(),
  distM: z.number(),
  avgHr: z.number().optional(),
  hrSeries: z.array(z.number()).optional(),
  elevGainM: z.number().optional(),
  isRace: z.boolean().optional(),
  isTest: z.boolean().optional(),
  tempC: z.number().optional(),
  feel: z.enum(["easy", "ok", "hard"]).optional(),
});
const dailySignalSchema = z.object({
  id: localDateSchema,
  rhr: z.number().optional(),
  sleepMin: z.number().optional(),
  bodyBatteryWake: z.number().optional(),
  stressAvg: z.number().optional(),
  vo2max: z.number().optional(),
});
const fitnessEstimateSchema = z.object({ id: z.string(), date: localDateSchema, vdot: z.number(), source: z.string() });
const chatMessageSchema = z.object({
  id: z.string(),
  at: z.string(),
  role: z.enum(["anna", "reggie"]),
  text: z.string(),
});
const pushSubscriptionSchema = z.object({
  id: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
/** Login tokens and sessions are stored by SHA-256 hash, never in clear. */
const secretSchema = z.object({ id: z.string(), expiresAt: z.string(), usedAt: z.string().optional() });

const single = <T extends z.ZodType>(value: T) => z.object({ id: z.string(), value });

function eventSpan(event: CalendarEvent): [string, string] {
  if (event.recurrence === "none") return [event.start, event.end];
  return [event.start, event.until ? `${event.until}T23:59` : "9999-12-31T23:59"];
}

const ranged =
  <T extends { id: string }>(field: (doc: T) => string) =>
  (doc: T): [string, string] => [field(doc), field(doc)];

export function createStores(db: DatabaseSync) {
  return {
    profile: new DocumentStore(db, "profile", single(profileSchema)),
    program: new DocumentStore(db, "program", single(programSchema)),
    plannedSession: new DocumentStore(db, "planned_session", plannedSessionSchema, (s) => [
      s.start,
      addMinutes(s.start, s.durMin),
    ]),
    calendarEvent: new DocumentStore(db, "calendar_event", calendarEventSchema, eventSpan),
    activity: new DocumentStore(db, "activity", activitySchema, (a) => [a.start, addMinutes(a.start, a.durMin)]),
    dailySignal: new DocumentStore(db, "daily_signal", dailySignalSchema, (s) => [s.id, s.id]),
    fitnessEstimate: new DocumentStore(
      db,
      "fitness_estimate",
      fitnessEstimateSchema,
      ranged((f) => f.date),
    ),
    changeLog: new DocumentStore(
      db,
      "change_log",
      changeEntrySchema,
      ranged((c) => c.at),
    ),
    chatMessage: new DocumentStore(
      db,
      "chat_message",
      chatMessageSchema,
      ranged((m) => m.at),
    ),
    pushSubscription: new DocumentStore(db, "push_subscription", pushSubscriptionSchema),
    authSession: new DocumentStore(db, "auth_session", secretSchema),
    loginToken: new DocumentStore(db, "login_token", secretSchema),
    meta: new DocumentStore(db, "meta", single(z.string())),
  };
}
export type Stores = ReturnType<typeof createStores>;
