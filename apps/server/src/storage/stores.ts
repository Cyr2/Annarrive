import type { DatabaseSync } from "node:sqlite";
import {
  type CalendarEvent,
  calendarEventSchema,
  chatMessageSchema,
  dailySignalSchema,
  deviceSchema,
  feelSchema,
  healthStatusSchema,
  incidentInputSchema,
  localDateSchema,
  localDateTimeSchema,
  plannedSessionSchema,
  profileSchema,
  programSchema,
  proposalSchema,
} from "@annarrive/protocol";
import { z } from "zod";
import { addMinutes } from "../time.ts";
import { DocumentStore } from "./store.ts";

/** Tables a plan change can touch, so the change log can restore them. */
export const planTables = [
  "planned_session",
  "calendar_event",
  "profile",
  "program",
  "health",
  "fitness_estimate",
  "proposal",
] as const;
export type PlanTable = (typeof planTables)[number];

export const changeEntrySchema = z.object({
  id: z.string(),
  at: z.string(),
  summary: z.string(),
  mutations: z.array(z.object({ table: z.enum(planTables), id: z.string(), before: z.unknown(), after: z.unknown() })),
  undoneAt: z.string().optional(),
});
export type ChangeEntry = z.infer<typeof changeEntrySchema>;

// Shaped like `Activity` in docs/specs/algo.md, plus what Garmin gave and the session it was matched to.
export const activitySchema = z.object({
  id: z.string(),
  start: localDateTimeSchema,
  durMin: z.number(),
  distM: z.number(),
  avgHr: z.number().optional(),
  /** Highest heart rate of the run: the observed maximum anchors F12 and F9. */
  maxHr: z.number().optional(),
  hrSeries: z.array(z.number()).optional(),
  elevGainM: z.number().optional(),
  isRace: z.boolean().optional(),
  isTest: z.boolean().optional(),
  tempC: z.number().optional(),
  feel: feelSchema.optional(),
  /** Anna's answer in the app, asked only when Garmin has no `feel`. */
  answeredFeel: feelSchema.optional(),
  /** Garmin self-evaluation, 1 to 10. */
  rpe: z.number().optional(),
  sessionId: z.string().optional(),
});
export type Activity = z.infer<typeof activitySchema>;

/** How a session felt when no run from the watch matched it (« Oui, je l'ai faite »): keyed by the session's id. */
const sessionFeelSchema = z.object({ id: z.string(), feel: feelSchema });
/** One estimate per day, the latest wins; `provisional` until a measured effort backs it (F10). */
const fitnessEstimateSchema = z.object({
  id: z.string(),
  date: localDateSchema,
  vdot: z.number(),
  source: z.string(),
  provisional: z.boolean().optional(),
});
export type FitnessEstimate = z.infer<typeof fitnessEstimateSchema>;
const pushSubscriptionSchema = z.object({
  id: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});
/**
 * What the watch holds for a planned session, kept apart from `planned_session` so a sync
 * never conflicts with Annuler. `hash` is the content last tried, sent or not.
 */
const watchSyncSchema = z.object({
  id: z.string(),
  /** "off": not sent, this instance runs with `GARMIN_WRITE=off`. */
  status: z.enum(["sent", "failed", "off"]),
  hash: z.string(),
  workoutId: z.number().int().optional(),
});
export type WatchSync = z.infer<typeof watchSyncSchema>;
/**
 * Login tokens and sessions are stored by SHA-256 hash, never in clear. `userId` is the account they open;
 * a link made without a name (and every session from before accounts) has none.
 */
const secretSchema = z.object({
  id: z.string(),
  expiresAt: z.string(),
  usedAt: z.string().optional(),
  userId: z.string().optional(),
});
export type AuthSession = z.infer<typeof secretSchema>;
/** An account, named by its login. The password is kept as a scrypt hash (services/password.ts). */
const userSchema = z.object({ id: z.string(), passwordHash: z.string().optional() });
/** A passkey: its credential id, and the public key that checks its signatures (base64url). */
const passkeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  publicKey: z.string(),
  counter: z.number().int().nonnegative(),
  transports: z.array(z.string()).optional(),
  createdAt: z.string(),
  lastUsedAt: z.string().optional(),
});
export type Passkey = z.infer<typeof passkeySchema>;

/** An incident as kept: what the phone sent (or the server saw), stamped and tied to its account on arrival. */
const incidentSchema = incidentInputSchema.extend({
  id: z.string(),
  type: z.enum([...incidentInputSchema.shape.type.options, "server"]),
  /** When the server received it; `clientAt` is the phone's own clock. */
  clientAt: z.string().optional(),
  device: deviceSchema.optional(),
  userId: z.string().optional(),
});
export type Incident = z.infer<typeof incidentSchema>;

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
    health: new DocumentStore(db, "health", single(healthStatusSchema)),
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
    proposal: new DocumentStore(db, "proposal", proposalSchema),
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
    user: new DocumentStore(db, "app_user", userSchema),
    passkey: new DocumentStore(db, "passkey", passkeySchema),
    meta: new DocumentStore(db, "meta", single(z.string())),
    watchSync: new DocumentStore(db, "watch_sync", watchSyncSchema),
    sessionFeel: new DocumentStore(db, "session_feel", sessionFeelSchema),
    incident: new DocumentStore(
      db,
      "incident",
      incidentSchema,
      ranged((i) => i.at),
    ),
  };
}
export type Stores = ReturnType<typeof createStores>;
