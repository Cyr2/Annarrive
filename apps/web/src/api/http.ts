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
  programViewSchema as serverProgramSchema,
  todaySchema as serverTodaySchema,
  weekSchema as serverWeekSchema,
  timetableRefreshSchema,
  timetableStatusSchema,
  unavailablePreviewSchema,
  watchInfoSchema,
} from "@annarrive/protocol";
import { z } from "zod";
import { addDays, addMinutes, isoWeek, minutesOf, mondayOf, toIso } from "../lib/date.ts";
import type { Api } from "./client.ts";
import { ApiError, OFFLINE } from "./errors.ts";
import { apiCall, incident } from "./journal.ts";
import {
  localAt,
  toChange,
  toChangeOptions,
  toChatEvents,
  toEventInput,
  toGoal,
  toMessages,
  toMoveOptions,
  toPreviewRows,
  toProfilePatch,
  toProgram,
  toRecurrence,
  toServerFeel,
  toToday,
  toUnavailable,
  toWeek,
} from "./map.ts";
import type { RefreshResult } from "./schemas.ts";

export const isHealthy = (body: unknown) => healthSchema.safeParse(body).success;

const UNEXPECTED = "Ça n'a pas marché : recharge l'app, puis réessaie.";
export const SIGNED_OUT = "Connecte-toi pour continuer.";

type Fetch = typeof fetch;

/** How long the timetable's and the watch's state are kept between two reads of the plan. */
const KEEP_MS = 5 * 60_000;

const isJson = (response: Response) => response.headers.get("content-type")?.includes("application/json") ?? false;

export async function serverMessage(response: Response): Promise<string | undefined> {
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
    const started = performance.now();
    const response = await fetcher(`/api${path}`, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }).catch(() => {
      apiCall(method, path, 0, performance.now() - started);
      throw new ApiError(0, OFFLINE);
    });
    apiCall(method, path, response.status, performance.now() - started);
    if (response.status === 401) {
      onSignedOut();
      throw new ApiError(401, SIGNED_OUT);
    }
    if (!response.ok) {
      const message = await serverMessage(response);
      throw new ApiError(response.status, message ?? "Ça n'a pas marché : réessaie dans un instant.");
    }
    return response;
  }
  async function read(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await send(method, path, body);
    return isJson(response) ? await response.json().catch(() => undefined) : undefined;
  }
  function parse<T>(json: unknown, schema: z.ZodType<T>, path: string): T {
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      // Where the answer and the app disagree, never the values themselves.
      const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.code}`);
      incident("api", `Réponse illisible ${path.split("?")[0]} : ${issues.join(", ")}`);
      throw new ApiError(502, UNEXPECTED);
    }
    return parsed.data;
  }
  const call = async <T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown) =>
    parse(await read(method, path, body), schema, path);
  // At launch Aujourd'hui reads six routes: /first-screen answers them all in one request (preloaded by
  // index.html). Each part serves once, through its route's schema; any later read asks its route.
  const weekPath = (monday: string) => `/weeks/${isoWeek(monday)}`;
  const firstPaths = () => {
    const monday = mondayOf(toIso(now()));
    return ["/today", "/program", "/proposals", "/timetable", weekPath(monday), weekPath(addDays(monday, 7))];
  };
  let firstLeft: Set<string> | undefined;
  let firstAnswers: Promise<Record<string, unknown>> | undefined;
  const fromFirst = async (path: string) => {
    firstLeft ??= new Set(firstPaths());
    if (!firstLeft.delete(path)) return read("GET", path);
    // An older server, or any failure: each route is asked on its own, as before.
    firstAnswers ??= read("GET", "/first-screen")
      .then((json) => z.looseObject({}).parse(json))
      .catch(() => ({}));
    const answers = await firstAnswers;
    return path in answers ? answers[path] : read("GET", path);
  };
  // Aujourd'hui and its week ask for the same week at the same time: one request answers both.
  const pending = new Map<string, Promise<unknown>>();
  const get = async <T>(path: string, schema: z.ZodType<T>) => {
    let json = pending.get(path);
    if (!json) {
      json = fromFirst(path).finally(() => pending.delete(path));
      pending.set(path, json);
    }
    return parse(await json, schema, path);
  };
  // When the timetable was last read and the watch's link change on their own actions, not with the plan: read
  // once and kept a few minutes, so a change re-reads only the plan. Down, they leave their own line unknown.
  const kept = <T>(path: string, schema: z.ZodType<T>) => {
    let hit: { at: number; value: Promise<T | undefined> } | undefined;
    return {
      read() {
        if (!hit || now().getTime() - hit.at > KEEP_MS) {
          const value = get(path, schema).catch(() => {
            if (hit?.value === value) hit = undefined;
            return undefined;
          });
          hit = { at: now().getTime(), value };
        }
        return hit.value;
      },
      drop: () => {
        hit = undefined;
      },
    };
  };
  const timetable = kept("/timetable", timetableStatusSchema);
  const watch = kept("/watch", watchInfoSchema);
  const change = async (method: string, path: string, body?: unknown) =>
    toChange(await call(method, path, changeResponseSchema, body));
  const run = async (method: string, path: string, body?: unknown) => {
    await send(method, path, body);
  };
  const id = encodeURIComponent;
  const today = () => toIso(now());
  const thisMonday = () => mondayOf(today());
  const week = (monday: string) => get(weekPath(monday), serverWeekSchema);
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
      const [w, status, program] = await Promise.all([
        week(monday),
        timetable.read(),
        get("/program", serverProgramSchema),
      ]);
      return toWeek(w, monday, status, today(), program.plan);
    },
    async program() {
      const [program, profile, status, days, link] = await Promise.all([
        get("/program", serverProgramSchema),
        get("/profile", profileSchema),
        timetable.read(),
        twoWeeks(),
        watch.read(),
      ]);
      return toProgram({ program, profile, lastSyncAt: status?.lastSyncAt, days, today: today(), watch: link });
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
    previewUnavailable: async (input) =>
      toPreviewRows(
        await call("POST", "/unavailable/preview", unavailablePreviewSchema, toUnavailable(input)),
        today(),
      ),
    unavailable: (input) => change("POST", "/unavailable", toUnavailable(input)),
    skip: (sessionId) => change("POST", `/sessions/${id(sessionId)}/skip`),
    confirmDone: (sessionId) => change("POST", `/sessions/${id(sessionId)}/done`),
    feelBetter: () => change("POST", "/feel-better"),
    acceptProposal: (proposalId) => change("POST", `/proposals/${id(proposalId)}/accept`),
    declineProposal: (proposalId) => change("POST", `/proposals/${id(proposalId)}/decline`),
    async undo(changeId) {
      await call("POST", `/changes/${id(changeId)}/undo`, changeSchema);
    },

    async refreshTimetable() {
      const result = refreshed(await call("POST", "/timetable/refresh", timetableRefreshSchema));
      timetable.drop();
      return result;
    },
    async setTimetableUrl(url) {
      const result = refreshed(await call("PUT", "/timetable/url", timetableRefreshSchema, { url }));
      timetable.drop();
      return result;
    },
    updateSettings: (patch) => change("PATCH", "/profile", toProfilePatch(patch)),
    updateGoal: (goal) => change("PUT", "/program", { goal: toGoal(goal) }),
    stopProgram: () => change("PUT", "/program", { goal: null }),
    async reconnectWatch() {
      await run("POST", "/watch/sync");
      watch.drop();
    },
    async resendToWatch() {
      await run("POST", "/watch/sync");
      watch.drop();
    },
    logFeel: (activityId, feel) => run("POST", `/activities/${id(activityId)}/feel`, { feel: toServerFeel(feel) }),

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
    async chatHistory(day) {
      const page = await get(day ? `/chat?day=${day}` : "/chat", chatHistorySchema);
      return { day: page.day, earlier: page.earlier, messages: page.messages.flatMap(toMessages) };
    },

    pushKey: async () => (await get("/push/key", pushKeySchema)).publicKey,
    async subscribePush(subscription) {
      const parsed = pushSubscriptionInputSchema.safeParse(subscription);
      if (!parsed.success) throw new ApiError(400, "Ce navigateur a donné un abonnement illisible : réessaie.");
      await run("POST", "/push/subscriptions", parsed.data);
    },
    unsubscribePush: (endpoint) => run("DELETE", "/push/subscriptions", { endpoint }),
  };
}
