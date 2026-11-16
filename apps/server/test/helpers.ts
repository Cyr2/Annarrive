import type { CalendarEvent, PlannedSession } from "@talaria/protocol";
import { createApp } from "../src/app.ts";
import { type CoachPort, passThroughCoach } from "../src/coach-port.ts";
import { createServices } from "../src/services/index.ts";
import { openDatabase } from "../src/storage/db.ts";
import { createStores } from "../src/storage/stores.ts";
import { addMinutes } from "../src/time.ts";

export const SECRET = "test-secret-test-secret-test-secret!";

/** Monday 16 November 2026, 08:00 in Paris. */
export const MONDAY_8AM = new Date("2026-11-16T07:00:00Z");

export function session(id: string, start: string, over: Partial<PlannedSession> = {}): PlannedSession {
  return {
    id,
    type: "E",
    start,
    durMin: 45,
    steps: [],
    rpeTarget: 3,
    priority: 3,
    status: "planned",
    manual: false,
    frozen: false,
    pilot: "pace",
    ...over,
  };
}

const overlaps = (s: PlannedSession, e: CalendarEvent) => s.start < e.end && addMinutes(s.start, s.durMin) > e.start;

/** Enough of the algorithm to watch the server wire it: conflicts move 30 min after the event. */
export const fakeCoach: CoachPort = {
  ...passThroughCoach,
  buildWeek: (st, weekStart) => ({
    state: { ...st, sessions: [...st.sessions, session(`built-${weekStart}`, `${weekStart}T18:00`)] },
    changes: [],
    warnings: [],
  }),
  moveSession: (st, id, slot, now) => {
    const result = passThroughCoach.moveSession(st, id, slot, now);
    const forced = slot.start.endsWith("T06:00");
    return forced ? { ...result, warnings: [{ ruleId: "H2", message: "Avant ton heure de début" }] } : result;
  },
  proposeMoveSlots: (_id, week) => ({
    best: [{ slot: { start: "2026-11-18T18:00", end: "2026-11-18T18:45" }, reason: "même heure, mercredi" }],
    forbidden: [],
    sideEffects: week.sessions.length > 1 ? [{ ruleId: "H4", message: "Ton footing de jeudi passe à vendredi" }] : [],
  }),
  onTimetableChange: (st, newEvents) => ({
    state: {
      ...st,
      events: newEvents,
      sessions: st.sessions.map((s) => {
        const hit = newEvents.find((e) => !s.manual && overlaps(s, e));
        return hit ? { ...s, start: addMinutes(hit.end, 30) } : s;
      }),
    },
    changes: [],
    warnings: [],
  }),
};

export function setup(options: { ics?: string | (() => Promise<string>); coach?: CoachPort } = {}) {
  const db = openDatabase(":memory:");
  let now = MONDAY_8AM;
  const clock = () => now;
  const { ics = "" } = options;
  const fetchIcs = typeof ics === "string" ? async () => ics : ics;
  const services = createServices({ db, clock, coach: options.coach ?? fakeCoach, fetchIcs });
  const app = createApp({ services, sessionSecret: SECRET });
  let cookie = "";

  return {
    db,
    stores: createStores(db),
    services,
    app,
    setNow: (instant: Date) => {
      now = instant;
    },
    async login() {
      const link = new URL(services.auth.createLoginLink("https://talaria.test"));
      const response = await app.request(`${link.pathname}${link.search}`);
      cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      return response;
    },
    /** An authenticated JSON request. */
    async call(method: string, path: string, body?: unknown) {
      const init: RequestInit = { method, headers: { cookie, "content-type": "application/json" } };
      if (body !== undefined) init.body = JSON.stringify(body);
      const response = await app.request(path, init);
      const json: unknown = await response.json();
      return { status: response.status, json };
    },
  };
}
