import { z } from "zod";

/** Local Europe/Paris wall-clock time, minute precision: "2026-11-16T18:00". */
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Format attendu : AAAA-MM-JJTHH:MM");
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu : AAAA-MM-JJ");
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format attendu : HH:MM");
export const isoWeekSchema = z.string().regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, "Format attendu : AAAA-Wss");

export const runTypeSchema = z.enum([
  "E",
  "RECUP",
  "L",
  "T",
  "CRUISE",
  "I",
  "R",
  "SPE",
  "COTES_C",
  "COTES_L",
  "FARTLEK",
  "TEST",
]);

const range = z.tuple([z.number(), z.number()]);
export const stepSchema = z.object({
  kind: z.enum(["warmup", "work", "recover", "cooldown", "strides"]),
  durMin: z.number().positive().optional(),
  distM: z.number().positive().optional(),
  reps: z.number().int().positive().optional(),
  target: z.object({ paceSKm: range.optional(), hrBpm: range.optional(), rpe: z.number().optional() }),
});

/** A planned run, shaped like `Session` in docs/specs/algo.md. */
export const plannedSessionSchema = z.object({
  id: z.string().min(1),
  type: runTypeSchema,
  start: localDateTimeSchema,
  durMin: z.number().positive(),
  steps: z.array(stepSchema),
  rpeTarget: z.number(),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  status: z.enum(["planned", "done", "missed", "skipped", "cancelled"]),
  manual: z.boolean(),
  frozen: z.boolean(),
  pilot: z.enum(["pace", "hr", "rpe"]),
});
export type PlannedSession = z.infer<typeof plannedSessionSchema>;

export const recurrenceSchema = z.enum(["none", "weekly", "biweekly"]);

/** Classes, exams, strength, revision and unavailability, shaped like `CalEvent` in algo.md. */
export const calendarEventSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["class", "exam", "strength", "revision", "unavailable"]),
  title: z.string(),
  start: localDateTimeSchema,
  end: localDateTimeSchema,
  location: z.string().optional(),
  legs: z.boolean().optional(),
  manual: z.boolean(),
  /** A class Anna marked "Ce cours n'a pas lieu": kept, but its slot is free. */
  cancelled: z.boolean(),
  recurrence: recurrenceSchema,
  /** Last day a recurring event happens, inclusive. */
  until: localDateSchema.optional(),
  /** Days skipped by "Cette semaine seulement". */
  exceptions: z.array(localDateSchema),
});
export type CalendarEvent = z.infer<typeof calendarEventSchema>;

/** Onboarding settings, shaped like `Settings` in algo.md (defaults from its section 4.2). */
export const profileSchema = z.object({
  runsPerWeek: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  earliest: timeOfDaySchema,
  latestEnd: timeOfDaySchema,
  noRunDays: z.array(z.number().int().min(1).max(7)),
  bedtime: timeOfDaySchema,
  preferredLongDay: z.number().int().min(1).max(7).optional(),
  preferredHour: timeOfDaySchema.optional(),
  useSleepHr: z.boolean(),
  travelMin: z.number().int().min(0).max(120),
  cycleTracking: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

export const goalSchema = z.object({
  distanceM: z.union([z.literal(5000), z.literal(10000), z.literal(21097.5), z.literal(42195)]),
  date: localDateSchema,
  targetMin: z.number().positive().optional(),
});

/** No goal means maintenance mode (algo.md M9). */
export const programSchema = z.object({ goal: goalSchema.nullable() });
export type Program = z.infer<typeof programSchema>;

const eventFields = z.object({
  kind: z.enum(["strength", "revision", "unavailable"]),
  title: z.string().trim().max(80),
  start: localDateTimeSchema,
  end: localDateTimeSchema,
  legs: z.boolean().optional(),
  recurrence: recurrenceSchema,
  until: localDateSchema.optional(),
});
const endAfterStart = (e: { start?: string | undefined; end?: string | undefined }) =>
  e.start === undefined || e.end === undefined || e.end > e.start;
const endAfterStartMessage = { message: "La fin doit venir après le début.", path: ["end"] };

export const createEventInputSchema = eventFields.refine(endAfterStart, endAfterStartMessage);
export type CreateEventInput = z.infer<typeof createEventInputSchema>;
export const updateEventInputSchema = eventFields
  .omit({ kind: true })
  .partial()
  .refine(endAfterStart, endAfterStartMessage);
export type UpdateEventInput = z.infer<typeof updateEventInputSchema>;

/** "Cette semaine seulement", "Cette semaine et les suivantes", or the whole series. */
export const deleteEventQuerySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all") }),
  z.object({ scope: z.enum(["occurrence", "following"]), date: localDateSchema }),
]);
export type DeleteEventQuery = z.infer<typeof deleteEventQuerySchema>;

export const moveSessionInputSchema = z.object({ start: localDateTimeSchema });
export const profilePatchSchema = profileSchema.partial();
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const slotSchema = z.object({ start: localDateTimeSchema, end: localDateTimeSchema });
export type Slot = z.infer<typeof slotSchema>;

export const moveSlotsSchema = z.object({
  best: z.array(z.object({ slot: slotSchema, reason: z.string() })),
  forbidden: z.array(z.object({ slot: slotSchema, reason: z.string() })),
  sideEffects: z.array(z.string()),
});
export type MoveSlots = z.infer<typeof moveSlotsSchema>;

/** What the "Annuler" banner needs. */
export const changeSchema = z.object({ id: z.string(), summary: z.string() });
export const changeResponseSchema = z.object({ change: changeSchema.nullable(), warnings: z.array(z.string()) });
export type ChangeResponse = z.infer<typeof changeResponseSchema>;

export const dayViewSchema = z.object({
  date: localDateSchema,
  sessions: z.array(plannedSessionSchema),
  events: z.array(calendarEventSchema),
});
export type DayView = z.infer<typeof dayViewSchema>;

export const todaySchema = z.object({
  date: localDateSchema,
  session: plannedSessionSchema.nullable(),
  events: z.array(calendarEventSchema),
});
export type Today = z.infer<typeof todaySchema>;

export const weekSchema = z.object({ week: isoWeekSchema, readOnly: z.boolean(), days: z.array(dayViewSchema) });
export type Week = z.infer<typeof weekSchema>;

export const timetableStatusSchema = z.object({ lastSyncAt: z.string().nullable() });
export type TimetableStatus = z.infer<typeof timetableStatusSchema>;

export const timetableRefreshSchema = z.object({
  lastSyncAt: z.string(),
  added: z.number().int(),
  changed: z.number().int(),
  removed: z.number().int(),
  /** "1 cours annulé jeudi · 1 course déplacée", empty when nothing changed. */
  summary: z.string(),
  change: changeSchema.nullable(),
});
export type TimetableRefresh = z.infer<typeof timetableRefreshSchema>;
