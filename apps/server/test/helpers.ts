import type { CalendarEvent, HealthStatus, PlannedSession, Unavailable } from "@talaria/protocol";
import type { Hono } from "hono";
import { vi } from "vitest";
import { createApp } from "../src/app.ts";
import { type CoachPort, coachFeasibility } from "../src/coach-port.ts";
import type { BridgeClient } from "../src/garmin/bridge-client.ts";
import type { ReggieRun } from "../src/reggie/agent.ts";
import { createServices } from "../src/services/index.ts";
import type { PushSender } from "../src/services/notifications.ts";
import { openDatabase } from "../src/storage/db.ts";
import { createStores } from "../src/storage/stores.ts";
import { addMinutes } from "../src/time.ts";

export const SECRET = "test-secret-test-secret-test-secret!";

/** What the "Se connecter" button of the login page sends. */
export function postLogin(app: Hono, token: string, site = "same-origin") {
  return app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": site },
    body: new URLSearchParams({ token }).toString(),
  });
}

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

function healthAfter(health: HealthStatus, r: Unavailable, now: string): HealthStatus {
  const since = now.slice(0, 10);
  if (r.reason === "sick") return r.feverOrChest ? { kind: "sick", since } : { kind: "cold", since };
  if (r.reason === "pain")
    return { kind: "pain", since, level: r.walking0to10, where: r.where, until: r.until, orientationSent: false };
  return health;
}

/** Applies every action without any rule: the double the service tests run on (the adapter has its own tests). */
export const passThroughCoach: CoachPort = {
  feasibility: coachFeasibility,
  buildWeek: (st) => ({ state: st, changes: [], warnings: [] }),
  moveSession: (st, id, slot) => ({
    state: {
      ...st,
      sessions: st.sessions.map((s) => (s.id === id ? { ...s, start: slot.start, manual: true } : s)),
    },
    changes: [],
    warnings: [],
  }),
  proposeMoveSlots: () => ({ best: [], forbidden: [], sideEffects: [] }),
  updateSettings: (st, patch) => ({
    state: { ...st, settings: { ...st.settings, ...patch } },
    changes: [],
    warnings: [],
  }),
  onTimetableChange: (st, newEvents) => ({ state: { ...st, events: newEvents }, changes: [], warnings: [] }),
  dailyDecision: (st) => ({ state: st, changes: [], warnings: [], action: "keep" }),
  changeOptions: (st, id) => {
    const s = st.sessions.find((x) => x.id === id);
    if (!s) throw new Error(`Unknown session ${id}`);
    const easy = (durMin: number): PlannedSession => ({ ...s, type: "E", durMin, steps: [], rpeTarget: 3 });
    return {
      shorter: { ...s, durMin: Math.round((s.durMin * 0.75) / 5) * 5 },
      easier: easy(s.durMin),
      jog30: easy(Math.min(30, s.durMin)),
    };
  },
  applyChange(st, id, option) {
    const chosen = passThroughCoach.changeOptions(st, id)[option];
    if (!chosen) return { state: st, changes: [], warnings: [], refusal: "Pas de séance équivalente pour celle-ci." };
    return {
      state: { ...st, sessions: st.sessions.map((s) => (s.id === id ? { ...chosen, manual: true } : s)) },
      changes: [],
      warnings: [],
    };
  },
  reportUnavailable: (st, r, now) => ({
    state: { ...st, health: healthAfter(st.health, r, now) },
    changes: [],
    warnings: [],
  }),
  feelBetter: (st) => ({ state: { ...st, health: { kind: "ok" } }, changes: [], warnings: [] }),
  decisionDue: () => true,
  estimateFitness: () => null,
  evaluateRun: () => null,
  acceptProposal: (st) => ({ state: st, changes: [], warnings: [] }),
};

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

/** A bridge whose every call is a mock; tests override the answers they need. */
export function fakeBridge() {
  return {
    recentActivities: vi.fn<BridgeClient["recentActivities"]>(async () => []),
    activityLaps: vi.fn<BridgeClient["activityLaps"]>(async () => []),
    dailySignals: vi.fn<BridgeClient["dailySignals"]>(async (date) => ({
      date,
      sleepS: null,
      sleepScore: null,
      restingHr: null,
      stressAvg: null,
      bodyBatteryAtWake: null,
      bodyBatteryHighest: null,
      vo2Max: null,
    })),
    createWorkout: vi.fn<BridgeClient["createWorkout"]>(async () => ({ workoutId: 1 })),
    deleteWorkout: vi.fn<BridgeClient["deleteWorkout"]>(async () => undefined),
  };
}

export function setup(
  options: {
    ics?: string | ((url: string) => Promise<string>);
    /** The server's `ICS_URL`; null leaves it unset. */
    icsUrl?: string | null;
    coach?: CoachPort;
    bridge?: BridgeClient;
    push?: { send: PushSender; publicKey: string };
    reggie?: ReggieRun;
  } = {},
) {
  const db = openDatabase(":memory:");
  let now = MONDAY_8AM;
  const clock = () => now;
  const { ics = "" } = options;
  const fetchIcs = typeof ics === "string" ? async () => ics : ics;
  const services = createServices({
    db,
    clock,
    coach: options.coach ?? fakeCoach,
    fetchIcs,
    icsUrl: options.icsUrl === null ? undefined : (options.icsUrl ?? "https://edt.test/env.ics"),
    bridge: options.bridge,
    push: options.push,
    reggie: options.reggie,
  });
  const app = createApp({ services, sessionSecret: SECRET });
  let cookie = "";
  /** An authenticated request. */
  const request = (method: string, path: string, body?: unknown) => {
    const init: RequestInit = { method, headers: { cookie, "content-type": "application/json" } };
    if (body !== undefined) init.body = JSON.stringify(body);
    return app.request(path, init);
  };

  return {
    db,
    stores: createStores(db),
    services,
    app,
    setNow: (instant: Date) => {
      now = instant;
    },
    async login() {
      const token = new URL(services.auth.createLoginLink("https://talaria.test")).searchParams.get("token") ?? "";
      const response = await postLogin(app, token);
      cookie = (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
      return response;
    },
    request,
    /** An authenticated JSON request. */
    async call(method: string, path: string, body?: unknown) {
      const response = await request(method, path, body);
      const text = await response.text();
      const json: unknown = text ? JSON.parse(text) : null;
      return { status: response.status, json };
    },
  };
}
