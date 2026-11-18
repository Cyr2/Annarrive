import { z } from "zod";

/** Local Europe/Paris wall-clock time, minute precision: "2026-11-16T18:00". */
export const localDateTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Ce jour ou cette heure n'est pas valide.");
export const localDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ce jour n'est pas valide.");
export const timeOfDaySchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Cette heure n'est pas valide.");
export const isoWeekSchema = z.string().regex(/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/, "Cette semaine n'est pas valide.");

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
  "RACE",
]);

/** The one name of each run type: on the watch, in the app, in notifications and in Reggie's answers. */
export const sessionNames: Record<z.infer<typeof runTypeSchema>, string> = {
  E: "Footing",
  RECUP: "Footing de récupération",
  L: "Sortie longue",
  T: "Seuil",
  CRUISE: "Seuil en fractions",
  I: "Fractionné",
  R: "Vitesse",
  SPE: "Allure objectif",
  COTES_C: "Côtes courtes",
  COTES_L: "Côtes longues",
  FARTLEK: "Fartlek",
  TEST: "Test de forme",
  RACE: "Jour J",
};

/** « passé », « fait » agreed with the session's name: « Sortie longue passée », « Côtes courtes faites ». */
export function agreeWith(type: z.infer<typeof runTypeSchema>, participle: string): string {
  if (type === "COTES_C" || type === "COTES_L") return `${participle}es`;
  return ["L", "R", "SPE"].includes(type) ? `${participle}e` : participle;
}

const range = z.tuple([z.number(), z.number()]);
export const stepSchema = z.object({
  kind: z.enum(["warmup", "work", "recover", "cooldown", "strides", "hills"]),
  durMin: z.number().positive().optional(),
  distM: z.number().positive().optional(),
  reps: z.number().int().positive().optional(),
  /** Which pace the step follows, so a new level can repace it (algo.md RC9). */
  zone: z.enum(["E", "M", "T", "I", "R", "race"]).optional(),
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

/** Anna's timetable feed, pasted in Programme; the server falls back to env `ICS_URL` without it. */
export const icsUrlSchema = z.url({ protocol: /^https$/, error: "Colle un lien qui commence par https://." });
export const timetableUrlInputSchema = z.object({ url: icsUrlSchema });

/** Onboarding settings, shaped like `Settings` in algo.md (defaults from its section 4.2). */
export const profileSchema = z.object({
  runsPerWeek: z.union([z.literal(3), z.literal(4), z.literal(5)]),
  earliest: timeOfDaySchema,
  latestEnd: timeOfDaySchema,
  noRunDays: z.array(z.number().int().min(1).max(7)),
  bedtime: timeOfDaySchema,
  /** Days her long run may go on (algo.md S8), 1 = Monday; the coach picks the freest of them each week. */
  preferredLongDays: z.array(z.number().int().min(1).max(7)).min(1).optional(),
  preferredHour: timeOfDaySchema.optional(),
  useSleepHr: z.boolean(),
  travelMin: z.number().int().min(0).max(120),
  cycleTracking: z.boolean(),
  icsUrl: icsUrlSchema.optional(),
});
export type Profile = z.infer<typeof profileSchema>;

/** A profile stored before the long run took several days: its one `preferredLongDay` becomes a list of one. */
export const storedProfileSchema = z.preprocess((raw) => {
  if (typeof raw !== "object" || raw === null || !("preferredLongDay" in raw)) return raw;
  const { preferredLongDay, ...rest } = raw;
  return "preferredLongDays" in rest || preferredLongDay === undefined
    ? rest
    : { ...rest, preferredLongDays: [preferredLongDay] };
}, profileSchema);

export const goalSchema = z.object({
  distanceM: z.union([z.literal(5000), z.literal(10000), z.literal(21097.5), z.literal(42195)]),
  date: localDateSchema,
  targetMin: z.number().positive().optional(),
  /** When the race starts; the coach takes 09:00 without it (algo.md P24). */
  startTime: timeOfDaySchema.optional(),
});

/**
 * « Ton dernier chrono »: a race time and roughly when, or her estimate when `date` is absent. It feeds the level
 * estimate (algo.md F10).
 */
export const declaredTimeSchema = z.object({
  distanceM: z.number().positive(),
  minutes: z.number().positive(),
  date: localDateSchema.optional(),
});
export type DeclaredTime = z.infer<typeof declaredTimeSchema>;

/** POST /api/feasibility: a goal with the target time she typed, and her last time when she gave one. */
export const feasibilityInputSchema = goalSchema
  .required({ targetMin: true })
  .extend({ declaredTime: declaredTimeSchema.optional() });
export type FeasibilityInput = z.infer<typeof feasibilityInputSchema>;
/** How her own target looks, never discouraging and never a proposed time; null until her form is known. */
export const feasibilitySchema = z.object({ verdict: z.enum(["atteignable", "ambitieux"]).nullable() });
export type Feasibility = z.infer<typeof feasibilitySchema>;

/** GET /api/onboarding: done once "C'est parti" stored her profile; the app never shows onboarding again. */
export const onboardingStatusSchema = z.object({ done: z.boolean() });
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

/** No goal means maintenance mode (algo.md M9). */
export const programSchema = z.object({
  goal: goalSchema.nullable(),
  declaredTime: declaredTimeSchema.optional(),
  /** Set by the server when the goal changes: the plan's phases count from this day. */
  startedOn: localDateSchema.optional(),
});
export type Program = z.infer<typeof programSchema>;
/** PUT /api/program: the goal may be left out, when only her last time changes. */
export const programInputSchema = programSchema.extend({ goal: goalSchema.nullable().optional() });
export type ProgramInput = z.infer<typeof programInputSchema>;

/** GET /api/program: the stored programme, with the plan the coach follows when there is a goal and a known form. */
export const programViewSchema = programSchema.extend({
  plan: z
    .object({
      /** Monday of « Semaine 1 »: the week the programme starts in, which runs plan week 1 (P3) too. */
      firstMonday: localDateSchema,
      /** P4 to P7, in order; a phase may last 0 weeks. */
      phases: z.array(
        z.object({ phase: z.enum(["base", "dev", "spe", "taper"]), weeks: z.number().int().nonnegative() }),
      ),
      /** Her target as POST /api/feasibility rates it; absent without a target time. */
      verdict: feasibilitySchema.shape.verdict.unwrap().optional(),
      /**
       * What the verdict rests on (P19), with it: her predicted time today, the training weeks before the taper,
       * the gain her target asks and the usual gain over those weeks (fractions, 0.05 = 5 %).
       */
      odds: z
        .object({
          currentMin: z.number().positive(),
          weeks: z.number().int().nonnegative(),
          gain: z.number(),
          gainMax: z.number().nonnegative(),
        })
        .optional(),
    })
    .optional(),
});
export type ProgramView = z.infer<typeof programViewSchema>;
export type TargetOdds = NonNullable<NonNullable<ProgramView["plan"]>["odds"]>;

/** A level change the coach proposes (algo.md M8), accepted or declined in one tap. */
export const proposalSchema = z.object({
  id: z.string(),
  kind: z.enum(["vdot", "test", "goal"]),
  from: z.number(),
  to: z.number(),
  ruleId: z.string(),
  evidence: z.array(z.string()),
  expiresOn: localDateSchema,
  status: z.enum(["pending", "accepted", "declined"]),
  decidedOn: localDateSchema.optional(),
});
export type Proposal = z.infer<typeof proposalSchema>;

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
/** The timetable link changes through `PUT /timetable/url`, which also re-reads the classes. */
export const profilePatchSchema = profileSchema.omit({ icsUrl: true }).partial();
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

/** "Sur ta montre", "Envoi à ta montre…", "Pas envoyée, réessayer" (docs/interactions.md). */
export const watchStatusSchema = z.enum(["pending", "sent", "failed", "off"]);
export type WatchStatus = z.infer<typeof watchStatusSchema>;

/** A session as the screens show it; `watch` is null outside the 7 days sent to the watch. */
export const sessionViewSchema = plannedSessionSchema.extend({ watch: watchStatusSchema.nullable() });
export type SessionView = z.infer<typeof sessionViewSchema>;

export const dayViewSchema = z.object({
  date: localDateSchema,
  sessions: z.array(sessionViewSchema),
  events: z.array(calendarEventSchema),
});
export type DayView = z.infer<typeof dayViewSchema>;

export const feelSchema = z.enum(["easy", "ok", "hard"]);
export type Feel = z.infer<typeof feelSchema>;

/** Today's run as Garmin sent it; `feel` is the watch's answer, `answeredFeel` the one Anna gave in the app. */
export const activityViewSchema = z.object({
  id: z.string(),
  start: localDateTimeSchema,
  durMin: z.number(),
  distM: z.number(),
  feel: feelSchema.optional(),
  answeredFeel: feelSchema.optional(),
  sessionId: z.string().optional(),
});
export type ActivityView = z.infer<typeof activityViewSchema>;

/** "Comment c'était ?" after a run the watch did not ask about. */
export const feelInputSchema = z.object({ feel: feelSchema });

export const painSiteSchema = z.enum(["mollet", "genou", "cheville", "hanche", "pied", "autre"]);
export type PainSite = z.infer<typeof painSiteSchema>;

/** Anna's health status, shaped like `Health` in algo.md M7. */
export const healthStatusSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("ok") }),
  z.object({ kind: z.literal("sick"), since: localDateSchema }),
  z.object({ kind: z.literal("cold"), since: localDateSchema }),
  z.object({
    kind: z.literal("pain"),
    since: localDateSchema,
    level: z.number().int().min(0).max(10),
    where: painSiteSchema,
    until: localDateSchema.optional(),
    orientationSent: z.boolean(),
  }),
  z.object({
    kind: z.literal("recovering"),
    easyUntil: localDateSchema,
    qEasierUntil: localDateSchema,
    /** First day of the fever: those days stay out of the morning baselines (B1). */
    since: localDateSchema.optional(),
  }),
]);
export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const todaySchema = z.object({
  date: localDateSchema,
  session: sessionViewSchema.nullable(),
  /** Why the morning check changed today's session (« Allégée : nuit courte »), only on the day it did. */
  note: z.string().optional(),
  events: z.array(calendarEventSchema),
  /** The latest run of the day, null before she runs. */
  activity: activityViewSchema.nullable(),
  /** What she declared (Pas dispo): the app offers « Ça va mieux » only while she is sick or hurt. */
  health: healthStatusSchema,
  /** A session that is over with no run matched: the app asks « Tu l'as faite ? » (algo.md EV17, EV21). */
  toConfirm: sessionViewSchema.nullable().optional(),
});
export type Today = z.infer<typeof todaySchema>;

export const weekSchema = z.object({ week: isoWeekSchema, readOnly: z.boolean(), days: z.array(dayViewSchema) });
export type Week = z.infer<typeof weekSchema>;

/** Programme > Montre Garmin: `lastSyncAt` is the last time Garmin answered (ISO instant), null if never. */
export const watchInfoSchema = z.object({ configured: z.boolean(), lastSyncAt: z.string().nullable() });
export type WatchInfo = z.infer<typeof watchInfoSchema>;

export const timetableStatusSchema = z.object({
  lastSyncAt: z.string().nullable(),
  /** The last read that changed something (« 1 cours annulé jeudi · Footing passé à vendredi 18:00 »), ISO instant. */
  lastChange: z.object({ at: z.string(), summary: z.string() }).optional(),
});
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

/** Shaped like `DailySignal` in docs/specs/algo.md; every field may be missing (vivoactive 4). */
export const dailySignalSchema = z.object({
  id: localDateSchema,
  rhr: z.number().optional(),
  sleepMin: z.number().optional(),
  bodyBatteryWake: z.number().optional(),
  stressAvg: z.number().optional(),
  vo2max: z.number().optional(),
});
export type DailySignal = z.infer<typeof dailySignalSchema>;

/** `PushSubscription.toJSON()` from the browser; extra fields are dropped. */
export const pushSubscriptionInputSchema = z.object({
  endpoint: z.url({ protocol: /^https$/ }),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
export const pushUnsubscribeInputSchema = pushSubscriptionInputSchema.pick({ endpoint: true });

/** Null when the server has no VAPID keys: the app then hides the notifications switch. */
export const pushKeySchema = z.object({ publicKey: z.string().nullable() });
export type PushKey = z.infer<typeof pushKeySchema>;

/** "Pas dispo" (algo.md EV7 to EV12); `until` absent means today only, ignored when sick. */
export const unavailableSchema = z.intersection(
  z.discriminatedUnion("reason", [
    z.object({ reason: z.literal("no_time") }),
    z.object({ reason: z.literal("tired") }),
    z.object({ reason: z.literal("sick"), feverOrChest: z.boolean() }),
    z.object({ reason: z.literal("pain"), where: painSiteSchema, walking0to10: z.number().int().min(0).max(10) }),
  ]),
  z.object({ until: localDateSchema.optional() }),
);
export type Unavailable = z.infer<typeof unavailableSchema>;

/** "Changer" (algo.md EV2 to EV5). */
export const changeOptionSchema = z.enum(["shorter", "easier", "equivalent", "jog30"]);
export type ChangeOption = z.infer<typeof changeOptionSchema>;
export const changeOptionsSchema = z.object({
  shorter: plannedSessionSchema,
  easier: plannedSessionSchema,
  equivalent: plannedSessionSchema.optional(),
  jog30: plannedSessionSchema,
});
export type ChangeOptions = z.infer<typeof changeOptionsSchema>;
export const changeSessionInputSchema = z.object({ option: changeOptionSchema });

/** Pas dispo's dry run: each day whose session would change, as it is and as it would be (null: no run). */
export const unavailablePreviewSchema = z.object({
  days: z.array(
    z.object({
      date: localDateSchema,
      before: plannedSessionSchema.nullable(),
      after: plannedSessionSchema.nullable(),
    }),
  ),
  warnings: z.array(z.string()),
});
export type UnavailablePreview = z.infer<typeof unavailablePreviewSchema>;
