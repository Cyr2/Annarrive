import { z } from "zod";

/** What the screens read from the server. Every response is parsed with these before use. */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^\d{1,2}:\d{2}$/);

export const intensitySchema = z.enum(["hard", "easy", "long"]);
export const watchStatusSchema = z.enum(["synced", "sending", "failed"]);

export const stepSchema = z.object({
  label: z.string(),
  pace: z.string(),
  tone: z.enum(["plain", "hard", "muted"]),
});

export const runSchema = z.object({
  id: z.string(),
  kind: z.literal("run"),
  date: isoDate,
  start: clock,
  durationMin: z.number().int().positive(),
  title: z.string(),
  intensity: intensitySchema,
  distanceKm: z.number().positive().optional(),
  mainSet: z.string().optional(),
  /** Garmin style target, "4:55" or "6:15 à 6:45". */
  pace: z.string(),
  steps: z.array(stepSchema),
  why: z.string(),
  watch: watchStatusSchema,
  /** Why the morning check made this session lighter, shown on the card. */
  lightened: z.string().optional(),
});

export const eventKindSchema = z.enum(["class", "strength", "revision", "busy"]);

export const eventSchema = z.object({
  id: z.string(),
  kind: eventKindSchema,
  date: isoDate,
  start: clock,
  end: clock,
  title: z.string(),
  legs: z.boolean().optional(),
  cancelled: z.boolean().optional(),
  templateId: z.string().optional(),
});

export const itemSchema = z.union([runSchema, eventSchema]);

export const goalSchema = z.object({ label: z.string(), daysLeft: z.number().int() });

export const activitySchema = z.object({
  id: z.string(),
  title: z.string(),
  receivedAt: clock,
  distanceKm: z.number(),
  duration: z.string(),
  mainPaceLabel: z.string(),
  mainPace: z.string(),
  verdict: z.string(),
  /** True when the watch did not record how it felt, so the app asks. */
  askFeel: z.boolean(),
  feel: z.enum(["easy", "fine", "hard"]).optional(),
});

export const todaySchema = z.object({
  date: isoDate,
  goal: goalSchema,
  session: runSchema.optional(),
  next: runSchema.optional(),
  activity: activitySchema.optional(),
});

export const weekSchema = z.object({
  monday: isoDate,
  index: z.number().int().optional(),
  total: z.number().int().optional(),
  readOnly: z.boolean(),
  timetableCheckedAt: z.string(),
  items: z.array(itemSchema),
});

export const slotSchema = z.object({ date: isoDate, start: clock });

export const moveOptionsSchema = z.object({
  slots: z.array(slotSchema.extend({ why: z.string(), consequence: z.string() })),
  /** Days the session cannot go to, with the rule that blocks them. */
  blocked: z.array(z.object({ date: isoDate, reason: z.string() })),
});

export const changeOptionIdSchema = z.enum(["shorter", "easier", "equivalent", "jog"]);

export const changeOptionSchema = z.object({
  id: changeOptionIdSchema,
  title: z.string(),
  detail: z.string(),
  intensity: intensitySchema,
});

export const changeRowSchema = z.object({
  day: z.string(),
  label: z.string(),
  tone: z.enum(["hard", "easy", "long", "rest", "other"]),
});

export const changeResultSchema = z.object({
  changeId: z.string(),
  /** Banner text, "Fractionné déplacé à mercredi 18:00". */
  message: z.string(),
  rows: z.array(changeRowSchema),
});

export const refreshResultSchema = z.object({ checkedAt: z.string(), summary: z.string().optional() });

export const repeatSchema = z.enum(["never", "weekly", "biweekly"]);

export const strengthSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  legs: z.boolean(),
  weekday: z.number().int().min(0).max(6),
  start: clock,
  durationMin: z.number().int().positive(),
  repeat: repeatSchema,
  placed: z.boolean(),
});

export const settingsSchema = z.object({
  runsPerWeek: z.number().int().min(2).max(6),
  noRunDays: z.array(z.number().int().min(0).max(6)),
  notBefore: clock,
  notAfter: clock,
  bedtime: clock,
  recoveryData: z.boolean(),
  cycle: z.boolean(),
  notifications: z.boolean(),
});

export const programSchema = z.object({
  goal: z.object({
    race: z.string(),
    distanceKm: z.number(),
    date: isoDate,
    targetTime: z.string().optional(),
    /** How her own target looks, never discouraging. The app never proposes a time. */
    targetTag: z.enum(["reachable", "ambitious"]).optional(),
  }),
  phases: z.array(z.object({ name: z.string(), weeks: z.number().int().positive() })),
  weekIndex: z.number().int(),
  weekTotal: z.number().int(),
  phaseNote: z.string(),
  maintenance: z.boolean(),
  settings: settingsSchema,
  strength: z.array(strengthSchema),
  timetableCheckedAt: z.string(),
  watch: z.object({ model: z.string(), connected: z.boolean(), lastSync: z.string() }),
});

export const sessionPreviewSchema = z.object({
  title: z.string(),
  detail: z.string(),
  intensity: intensitySchema,
});

export const widgetSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("choices"), label: z.string(), options: z.array(z.string()).min(2).max(6) }),
  z.object({ type: z.literal("scale"), label: z.string() }),
  z.object({ type: z.literal("slots"), sessionId: z.string(), slots: moveOptionsSchema.shape.slots }),
  z.object({
    type: z.literal("preview"),
    sessionId: z.string(),
    optionId: changeOptionIdSchema,
    session: sessionPreviewSchema,
    alternative: z.string(),
  }),
  z.object({ type: z.literal("change"), change: changeResultSchema }),
]);

export const chatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["user", "reggie"]),
  text: z.string(),
  widget: widgetSchema.optional(),
  source: z.object({ label: z.string(), url: z.url() }).optional(),
});

export const chatEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: z.enum(["thinking", "searching"]) }),
  z.object({ type: z.literal("message"), message: chatMessageSchema }),
]);

export type Intensity = z.infer<typeof intensitySchema>;
export type WatchStatus = z.infer<typeof watchStatusSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Run = z.infer<typeof runSchema>;
export type EventKind = z.infer<typeof eventKindSchema>;
export type CalendarEvent = z.infer<typeof eventSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Activity = z.infer<typeof activitySchema>;
export type Feel = NonNullable<Activity["feel"]>;
export type Today = z.infer<typeof todaySchema>;
export type Week = z.infer<typeof weekSchema>;
export type Slot = z.infer<typeof slotSchema>;
export type MoveOptions = z.infer<typeof moveOptionsSchema>;
export type ProposedSlot = MoveOptions["slots"][number];
export type ChangeOptionId = z.infer<typeof changeOptionIdSchema>;
export type ChangeOption = z.infer<typeof changeOptionSchema>;
export type ChangeRow = z.infer<typeof changeRowSchema>;
export type ChangeResult = z.infer<typeof changeResultSchema>;
export type RefreshResult = z.infer<typeof refreshResultSchema>;
export type Repeat = z.infer<typeof repeatSchema>;
export type Strength = z.infer<typeof strengthSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type Program = z.infer<typeof programSchema>;
export type SessionPreview = z.infer<typeof sessionPreviewSchema>;
export type Widget = z.infer<typeof widgetSchema>;
export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatEvent = z.infer<typeof chatEventSchema>;
