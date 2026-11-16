import { healthSchema } from "@talaria/protocol";
import { z } from "zod";
import type { Api } from "./client.ts";
import {
  changeOptionSchema,
  changeResultSchema,
  changeRowSchema,
  chatEventSchema,
  moveOptionsSchema,
  programSchema,
  refreshResultSchema,
  todaySchema,
  weekSchema,
} from "./schemas.ts";

export const isHealthy = (body: unknown) => healthSchema.safeParse(body).success;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Fetch = typeof fetch;

async function send(fetcher: Fetch, path: string, method: string, body?: unknown): Promise<Response> {
  const response = await fetcher(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new ApiError(response.status, `${method} ${path} : ${response.status}`);
  return response;
}

/** Splits a newline-delimited JSON body into parsed lines. */
export async function* ndjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  // A reader loop rather than `for await`: older Safari streams are not async iterable.
  const reader = body.getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) if (line.trim()) yield JSON.parse(line);
  }
  if (buffer.trim()) yield JSON.parse(buffer);
}

export function createHttpApi(fetcher: Fetch = fetch): Api {
  const get = async <T>(path: string, schema: z.ZodType<T>) =>
    schema.parse(await (await send(fetcher, path, "GET")).json());
  const call = async <T>(method: string, path: string, schema: z.ZodType<T>, body?: unknown) =>
    schema.parse(await (await send(fetcher, path, method, body)).json());
  const run = async (method: string, path: string, body?: unknown) => {
    await send(fetcher, path, method, body);
  };
  const id = encodeURIComponent;

  return {
    mode: "server",
    today: () => get("/today", todaySchema),
    week: (offset) => get(`/week?offset=${offset}`, weekSchema),
    program: () => get("/program", programSchema),
    addEvent: (input) => call("POST", "/events", changeResultSchema, input),
    updateEvent: (eventId, patch) => call("PATCH", `/events/${id(eventId)}`, changeResultSchema, patch),
    deleteEvent: (eventId, scope) => call("DELETE", `/events/${id(eventId)}?scope=${scope}`, changeResultSchema),
    saveStrength: (template) => call("PUT", `/strength/${id(template.id)}`, changeResultSchema, template),
    deleteStrength: (templateId, scope) =>
      call("DELETE", `/strength/${id(templateId)}?scope=${scope}`, changeResultSchema),
    moveOptions: (itemId) => get(`/items/${id(itemId)}/move-options`, moveOptionsSchema),
    move: (itemId, slot) => call("POST", `/items/${id(itemId)}/move`, changeResultSchema, slot),
    changeOptions: (sessionId) => get(`/sessions/${id(sessionId)}/change-options`, z.array(changeOptionSchema)),
    change: (sessionId, option) => call("POST", `/sessions/${id(sessionId)}/change`, changeResultSchema, { option }),
    previewUnavailable: (input) => call("POST", "/unavailable/preview", z.array(changeRowSchema), input),
    unavailable: (input) => call("POST", "/unavailable", changeResultSchema, input),
    skip: (sessionId) => call("POST", `/sessions/${id(sessionId)}/skip`, changeResultSchema),
    undo: (changeId) => run("POST", `/changes/${id(changeId)}/undo`),
    refreshTimetable: () => call("POST", "/timetable/refresh", refreshResultSchema),
    updateSettings: (patch) => call("PATCH", "/program/settings", changeResultSchema, patch),
    updateGoal: (goal) => call("PUT", "/program/goal", changeResultSchema, goal),
    stopProgram: () => call("POST", "/program/stop", changeResultSchema),
    reconnectWatch: () => run("POST", "/watch/reconnect"),
    resendToWatch: (sessionId) => run("POST", `/sessions/${id(sessionId)}/watch`),
    logFeel: (activityId, feel) => run("POST", `/activities/${id(activityId)}/feel`, { feel }),
    async *chat(input) {
      const response = await send(fetcher, "/chat", "POST", input);
      if (!response.body) return;
      for await (const line of ndjson(response.body)) yield chatEventSchema.parse(line);
    },
  };
}
