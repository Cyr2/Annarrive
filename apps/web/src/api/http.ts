import {
  changeResponseSchema,
  changeSchema,
  chatHistorySchema,
  chatStreamEventSchema,
  healthSchema,
  moveSlotsSchema,
  profileSchema,
  proposalSchema,
  pushKeySchema,
  pushSubscriptionInputSchema,
  changeOptionsSchema as serverChangeOptionsSchema,
  programSchema as serverProgramSchema,
  todaySchema as serverTodaySchema,
  weekSchema as serverWeekSchema,
  timetableRefreshSchema,
  timetableStatusSchema,
} from "@talaria/protocol";
import { z } from "zod";
import { addDays, addMinutes, isoWeek, minutesOf, mondayOf, toIso } from "../lib/date.ts";
import type { Api } from "./client.ts";
import { ApiError } from "./errors.ts";
import {
  localAt,
  toChange,
  toChangeOptions,
  toChatEvents,
  toEventInput,
  toGoal,
  toMessages,
  toMoveOptions,
  toProfilePatch,
  toProgram,
  toRecurrence,
  toToday,
  toUnavailable,
  toWeek,
  unavailableRows,
} from "./map.ts";
import type { RefreshResult } from "./schemas.ts";

export const isHealthy = (body: unknown) => healthSchema.safeParse(body).success;

const OFFLINE = "Pas de connexion au serveur : vérifie ton réseau, puis réessaie.";
const UNEXPECTED = "Le serveur a répondu de travers : recharge l'app, puis réessaie.";
export const SIGNED_OUT = "Ouvre le lien de connexion que tu as reçu.";

type Fetch = typeof fetch;

const isJson = (response: Response) => response.headers.get("content-type")?.includes("application/json") ?? false;

async function serverMessage(response: Response): Promise<string | undefined> {
  if (!isJson(response)) return undefined;
  const body: unknown = await response.json().catch(() => undefined);
  return typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
    ? body.error
    : undefined;
}

/** Splits a server-sent event stream into the parsed `data` of each event. */
export async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  // A reader loop rather than `for await`: older Safari streams are not async iterable.
  const reader = body.getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = done ? "" : (blocks.pop() ?? "");
    for (const block of blocks) {
      const data = block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).replace(/^ /, ""))
        .join("\n");
      if (data) yield JSON.parse(data);
    }
    if (done) return;
  }
}

/**
 * The real server (apps/server). Every answer is validated with the protocol schemas, then mapped in `map.ts`.
 * A 401 calls `onSignedOut`, so the app can ask for the login link.
 */
export function createHttpApi(
  fetcher: Fetch = fetch,
  onSignedOut: () => void = () => undefined,
  now = () => new Date(),
): Api {
  async function send(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetcher(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => {
      throw new ApiError(0, OFFLINE);
    });
    if (response.status === 401) {
      onSignedOut();
      throw new ApiError(401, SIGNED_OUT);
    }
    if (!response.ok) {
      const message = await serverMessage(response);
      throw new ApiError(
        response.status,
        message ?? `Le serveur a répondu ${response.status} : réessaie dans un instant.`,
      );
    }
    return response;
  }
  async function call<T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown): Promise<T> {
    const response = await send(method, path, body);
    const json: unknown = isJson(response) ? await response.json().catch(() => undefined) : undefined;
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ApiError(502, UNEXPECTED);
    return parsed.data;
  }
  const get = <T>(path: string, schema: z.ZodType<T>) => call("GET", path, schema);
  const change = async (method: string, path: string, body?: unknown) =>
    toChange(await call(method, path, changeResponseSchema, body));
  const run = async (method: string, path: string, body?: unknown) => {
    await send(method, path, body);
  };
  const id = encodeURIComponent;
  const today = () => toIso(now());
  const thisMonday = () => mondayOf(today());
  const week = (monday: string) => get(`/weeks/${isoWeek(monday)}`, serverWeekSchema);
  const twoWeeks = async () => {
    const weeks = await Promise.all([week(thisMonday()), week(addDays(thisMonday(), 7))]);
    return weeks.flatMap((w) => w.days);
  };
  const refreshed = (r: z.infer<typeof timetableRefreshSchema>): RefreshResult => ({
    checkedAt: r.lastSyncAt,
    summary: r.summary || undefined,
  });
  /** The date a template falls on this week, never in the past. */
  const nextDate = (weekday: number) => {
    const date = addDays(thisMonday(), weekday);
    return date < today() ? addDays(date, 7) : date;
  };
  const deleteQuery = (scope: "one" | "all", date: string | undefined, all: "all" | "following") => {
    if (!date) return "scope=all";
    return scope === "one"
      ? `scope=occurrence&date=${date}`
      : all === "all"
        ? "scope=all"
        : `scope=following&date=${date}`;
  };

  return {
    mode: "server",
    async today() {
      const [t, program, days, proposals] = await Promise.all([
        get("/today", serverTodaySchema),
        get("/program", serverProgramSchema),
        twoWeeks(),
        get("/proposals", z.array(proposalSchema)),
      ]);
      return toToday(t, program, days, proposals);
    },
    async week(offset) {
      const monday = addDays(thisMonday(), offset * 7);
      const [w, status] = await Promise.all([week(monday), get("/timetable", timetableStatusSchema)]);
      return toWeek(w, monday, status.lastSyncAt);
    },
    async program() {
      const [program, profile, status, days] = await Promise.all([
        get("/program", serverProgramSchema),
        get("/profile", profileSchema),
        get("/timetable", timetableStatusSchema),
        twoWeeks(),
      ]);
      return toProgram({ program, profile, lastSyncAt: status.lastSyncAt, days, today: today() });
    },

    addEvent: (input) => change("POST", "/events", toEventInput(input)),
    updateEvent(eventId, patch) {
      if (patch.cancelled !== undefined)
        return change(patch.cancelled ? "POST" : "DELETE", `/events/${id(eventId)}/cancel`);
      const { date, start, end } = patch;
      const span = date && start && end ? { start: localAt(date, start), end: localAt(date, end) } : {};
      return change("PATCH", `/events/${id(eventId)}`, { title: patch.title, ...span });
    },
    deleteEvent: (eventId, scope, date) =>
      change("DELETE", `/events/${id(eventId)}?${deleteQuery(scope, date, "all")}`),
    saveStrength(template, existing) {
      const date = nextDate(template.weekday);
      const fields = {
        title: template.name,
        legs: template.legs,
        start: localAt(date, template.start),
        end: localAt(date, addMinutes(template.start, template.durationMin)),
        recurrence: toRecurrence(template.repeat),
      };
      return existing
        ? change("PATCH", `/events/${id(template.id)}`, fields)
        : change("POST", "/events", { kind: "strength", ...fields });
    },
    deleteStrength: (templateId, scope, date) =>
      change("DELETE", `/events/${id(templateId)}?${deleteQuery(scope, date, "following")}`),

    moveOptions: async (sessionId) => toMoveOptions(await get(`/sessions/${id(sessionId)}/slots`, moveSlotsSchema)),
    move(itemId, slot, event) {
      if (!event) return change("POST", `/sessions/${id(itemId)}/move`, { start: localAt(slot.date, slot.start) });
      const minutes = minutesOf(event.end) - minutesOf(event.start);
      return change("PATCH", `/events/${id(itemId)}`, {
        start: localAt(slot.date, slot.start),
        end: localAt(slot.date, addMinutes(slot.start, minutes)),
      });
    },
    changeOptions: async (sessionId) =>
      toChangeOptions(await get(`/sessions/${id(sessionId)}/options`, serverChangeOptionsSchema)),
    change: (sessionId, option) =>
      change("POST", `/sessions/${id(sessionId)}/change`, { option: option === "jog" ? "jog30" : option }),
    previewUnavailable: async (input) => unavailableRows(input, today()),
    unavailable: (input) => change("POST", "/unavailable", toUnavailable(input)),
    skip: () => change("POST", "/unavailable", { reason: "no_time" }),
    feelBetter: () => change("POST", "/feel-better"),
    acceptProposal: (proposalId) => change("POST", `/proposals/${id(proposalId)}/accept`),
    declineProposal: (proposalId) => change("POST", `/proposals/${id(proposalId)}/decline`),
    async undo(changeId) {
      await call("POST", `/changes/${id(changeId)}/undo`, changeSchema);
    },

    refreshTimetable: async () => refreshed(await call("POST", "/timetable/refresh", timetableRefreshSchema)),
    setTimetableUrl: async (url) => refreshed(await call("PUT", "/timetable/url", timetableRefreshSchema, { url })),
    updateSettings: (patch) => change("PATCH", "/profile", toProfilePatch(patch)),
    updateGoal: (goal) => change("PUT", "/program", { goal: toGoal(goal) }),
    stopProgram: () => change("PUT", "/program", { goal: null }),
    reconnectWatch: () => run("POST", "/watch/sync"),
    resendToWatch: () => run("POST", "/watch/sync"),
    logFeel: async () => {
      throw new ApiError(501, "Le ressenti se note sur ta montre pour l'instant.");
    },

    async *chat(input) {
      const response = await send("POST", "/chat", input);
      if (!response.body) throw new ApiError(502, UNEXPECTED);
      const draft = { id: `reggie-${now().getTime()}`, text: "" };
      for await (const data of sse(response.body)) {
        const parsed = chatStreamEventSchema.safeParse(data);
        if (!parsed.success) throw new ApiError(502, UNEXPECTED);
        yield* toChatEvents(parsed.data, draft);
      }
    },
    chatHistory: async () => (await get("/chat", chatHistorySchema)).messages.flatMap(toMessages),

    pushKey: async () => (await get("/push/key", pushKeySchema)).publicKey,
    async subscribePush(subscription) {
      const parsed = pushSubscriptionInputSchema.safeParse(subscription);
      if (!parsed.success) throw new ApiError(400, "Ce navigateur a donné un abonnement illisible : réessaie.");
      await run("POST", "/push/subscriptions", parsed.data);
    },
    unsubscribePush: (endpoint) => run("DELETE", "/push/subscriptions", { endpoint }),
  };
}
