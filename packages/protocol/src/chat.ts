import { z } from "zod";
import { changeOptionSchema, localDateSchema, plannedSessionSchema, slotSchema } from "./api.ts";

/** Where the conversation was opened from, so Reggie knows what "cette séance" means. */
export const chatContextSchema = z.object({
  screen: z.enum(["today", "week", "program", "after_run", "session"]),
  sessionId: z.string().min(1).optional(),
});
export type ChatContext = z.infer<typeof chatContextSchema>;

/** Tappable widgets under a Reggie message (docs/interactions.md, "Les widgets dans la conversation"). */
export const chatWidgetSchema = z.discriminatedUnion("type", [
  /** A closed question: each tap sends its label as Anna's message. */
  z.object({ type: z.literal("choices"), options: z.array(z.string().min(1).max(40)).min(2).max(5) }),
  /** Pain or fatigue level, sent as "<n>/10". */
  z.object({ type: z.literal("slider"), label: z.string().min(1), min: z.literal(0), max: z.literal(10) }),
  /** Move proposal: up to 3 slots, tap then the change card appears. */
  z.object({
    type: z.literal("slots"),
    sessionId: z.string(),
    slots: z
      .array(z.object({ slot: slotSchema, reason: z.string() }))
      .min(1)
      .max(3),
  }),
  /** Replacement proposal with "Prendre celle-ci". */
  z.object({
    type: z.literal("session_preview"),
    sessionId: z.string(),
    option: changeOptionSchema,
    session: plannedSessionSchema,
  }),
  /** After any change: Annuler stays active until the next change. */
  z.object({
    type: z.literal("change"),
    changeId: z.string(),
    summary: z.string(),
    warnings: z.array(z.string()),
  }),
  /** "Je vérifie" while Reggie searches a source; streamed only, never stored. */
  z.object({ type: z.literal("checking") }),
]);
export type ChatWidget = z.infer<typeof chatWidgetSchema>;

export const chatMessageSchema = z.object({
  id: z.string(),
  at: z.string(),
  role: z.enum(["anna", "reggie"]),
  text: z.string(),
  widgets: z.array(chatWidgetSchema),
  context: chatContextSchema.optional(),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  text: z.string().trim().min(1).max(2000),
  context: chatContextSchema.optional(),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** GET /api/chat?day=: one Paris day of the conversation (today without `day`), oldest message first. */
export const chatHistorySchema = z.object({
  day: localDateSchema,
  messages: z.array(chatMessageSchema),
  /** The latest earlier day with messages, the next one to load; absent when there is none. */
  earlier: localDateSchema.optional(),
});
export type ChatHistory = z.infer<typeof chatHistorySchema>;
export const chatHistoryQuerySchema = z.object({ day: localDateSchema.optional() });

/**
 * One server-sent event of `POST /api/chat`; the SSE `event` field repeats `type`.
 * Order: typing, text deltas, widgets, then done (or error).
 */
export const chatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("typing") }),
  z.object({ type: z.literal("text"), delta: z.string() }),
  z.object({ type: z.literal("widget"), widget: chatWidgetSchema }),
  z.object({ type: z.literal("done"), message: chatMessageSchema }),
  /** `retry: false` when sending again cannot help (Reggie is off on this server). */
  z.object({ type: z.literal("error"), error: z.string(), retry: z.boolean().optional() }),
]);
export type ChatStreamEvent = z.infer<typeof chatStreamEventSchema>;

/** What stays on the app's server and what leaves it: said the same wherever she is asked to share data. */
export const PRIVACY_NOTE =
  "Tes données restent sur le serveur de l'app. Seul Reggie fait exception : pour te répondre, un service d'IA (Anthropic) reçoit tes messages et les données de ton plan dont il a besoin. Si quelque chose plante, l'app garde un journal technique de tes derniers gestes pendant 30 jours, sans le contenu de tes messages, pour qu'on puisse réparer.";
