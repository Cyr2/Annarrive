import { readFileSync } from "node:fs";
import type { GarminActivity, GarminLap } from "@annarrive/protocol";
import { z } from "zod";
import { marathonReturn } from "../../../packages/coach/test/marathon-return.ts";
import { createApp } from "../src/app.ts";
import { coachAdapter } from "../src/coach-adapter.ts";
import type { BridgeClient } from "../src/garmin/bridge-client.ts";
import type { ReggieRun } from "../src/reggie/agent.ts";
import { createJobs, Scheduler } from "../src/scheduler.ts";
import { createServices } from "../src/services/index.ts";
import { openDatabase } from "../src/storage/db.ts";
import { createStores } from "../src/storage/stores.ts";
import { addDays, addMinutes, toParisLocal } from "../src/time.ts";

/** Monday 23 November 2026, 8:00 in Paris: two days after the audit the persona is drawn from. */
export const START = new Date("2026-11-23T07:00:00Z");
export const ICS_URL = "https://edt.jumeau.test/anna.ics";
const FIXTURES = new URL("../../../e2e/fixtures/", import.meta.url);

/** The e2e timetable's first week (v1, or v2 without Biochimie), repeated weekly from 16 November for 6 weeks. */
export function timetable(version: 1 | 2): string {
  const text = readFileSync(new URL(version === 1 ? "timetable.ics" : "timetable-v2.ics", FIXTURES), "utf8");
  const blocks = text.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  const firstWeek = blocks.filter((b) => (/DTSTART:(\d{8})/.exec(b)?.[1] ?? "") < "20261123");
  // If the e2e file moves to another week, the twin says so rather than run on an empty timetable.
  if (firstWeek.length === 0) throw new Error("e2e/fixtures : plus aucun cours la semaine du 16 novembre");
  const shift = (block: string, weeks: number) =>
    block
      .replace(/(DTSTART|DTEND):(\d{4})(\d{2})(\d{2})/g, (_, key: string, y: string, m: string, d: string) => {
        const day = addDays(`${y}-${m}-${d}`, 7 * weeks).replaceAll("-", "");
        return `${key}:${day}`;
      })
      .replace(/UID:(.*)/, (_, uid: string) => `UID:${uid}-w${weeks}`);
  const events = Array.from({ length: 6 }, (_, w) => firstWeek.map((b) => shift(b, w))).flat();
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Annarrivé//jumeau//FR", ...events, "END:VCALENDAR"].join("\r\n");
}

/** What the fake Garmin holds: her year of runs (persona retour-marathon), then what she runs in the simulation. */
export class FakeGarmin {
  readonly runs: GarminActivity[] = [];
  readonly laps = new Map<number, GarminLap[]>();
  /** The workouts on her watch, by id. */
  readonly watch = new Map<number, unknown>();
  unknownDeletes = 0;
  #nextWorkout = 1;
  #nextRun = 1;

  constructor() {
    for (const a of marathonReturn()) {
      this.add(a.start, a.durMin, a.distM, a.avgHr ?? null, a.isRace === true);
      const id = this.#nextRun - 1;
      if (a.laps)
        this.laps.set(
          id,
          a.laps.map((l) => ({
            durationS: l.durMin * 60,
            distanceM: l.distM,
            avgSpeedMps: null,
            avgHr: l.avgHr ?? null,
          })),
        );
    }
  }

  add(start: string, durMin: number, distM: number, avgHr: number | null, isRace = false, feel: number | null = null) {
    this.runs.push({
      id: this.#nextRun++,
      type: "running",
      startTimeLocal: `${start.replace("T", " ")}:00`,
      startTimeGmt: null,
      durationS: Math.round(durMin * 60),
      distanceM: Math.round(distM),
      avgSpeedMps: null,
      avgPaceSPerKm: null,
      avgHr,
      maxHr: avgHr === null ? null : avgHr + 12,
      elevationGainM: Math.round(distM / 500),
      feel,
      rpe: null,
      eventType: isRace ? "race" : null,
    });
  }

  /** The bridge, newest run first as Garmin lists them; a run shows once it has ended. */
  bridge(now: () => string): BridgeClient {
    return {
      recentActivities: async (limit = 20, start = 0) =>
        this.runs
          .filter(
            (r) =>
              addMinutes((r.startTimeLocal ?? "").replace(" ", "T").slice(0, 16), (r.durationS ?? 0) / 60) <= now(),
          )
          .sort((a, b) => (b.startTimeLocal ?? "").localeCompare(a.startTimeLocal ?? ""))
          .slice(start, start + limit),
      activityLaps: async (id) => this.laps.get(id) ?? [],
      dailySignals: async (date) => ({
        date,
        sleepS: 27_000,
        sleepScore: 80,
        restingHr: 52,
        stressAvg: 30,
        bodyBatteryAtWake: 70,
        bodyBatteryHighest: 80,
        vo2Max: 45,
      }),
      createWorkout: async (request) => {
        const workoutId = this.#nextWorkout++;
        this.watch.set(workoutId, request);
        return { workoutId };
      },
      deleteWorkout: async (id) => {
        if (!this.watch.delete(id)) this.unknownDeletes++;
      },
    };
  }
}

/** A Reggie that calls the tool the scenario asks for, through the same tool code as the real one. */
export type ReggieAsk = { name: string; input: Record<string, unknown> };

export function fakeReggie(next: () => ReggieAsk | undefined): ReggieRun {
  return async function* ({ tools }) {
    const ask = next();
    if (!ask) {
      yield { type: "text", delta: "D'accord." };
      return;
    }
    yield { type: "tool_call", name: ask.name, input: ask.input };
    const def = tools.find((t) => t.name === ask.name);
    if (!def) throw new Error(`Outil inconnu : ${ask.name}`);
    const args = z.object(def.inputSchema).safeParse(ask.input);
    // The SDK hands a bad input back to the model as a tool error; the model then answers in words.
    if (!args.success) {
      yield { type: "text", delta: "Ce réglage n'est pas possible." };
      return;
    }
    // Each tool has its own argument type; the parse just above checks it, as the SDK does.
    const handler = def.handler as (input: unknown, extra: unknown) => Promise<unknown>;
    await handler(args.data, {});
    yield { type: "text", delta: "C'est fait." };
  };
}

export type Response = { status: number; json: unknown; ms: number };

/** The real server (routes, services, coach, change log) on an in-memory base, with a clock the twin moves. */
export async function createWorld() {
  const db = openDatabase(":memory:");
  let now = START;
  const clock = () => now;
  const local = () => toParisLocal(now);
  const garmin = new FakeGarmin();
  let ics: 1 | 2 = 1;
  let ask: ReggieAsk | undefined;
  const services = createServices({
    db,
    clock,
    publicUrl: "https://annarrive.test",
    coach: coachAdapter,
    fetchIcs: async () => timetable(ics),
    bridge: garmin.bridge(local),
    reggie: fakeReggie(() => {
      const a = ask;
      ask = undefined;
      return a;
    }),
    garminPauseMs: 0,
  });
  const app = createApp({ services, sessionSecret: "jumeau-secret-jumeau-secret-jumeau!!" });
  const jobs = createJobs({
    refreshTimetable: () => (services.timetable.url() ? services.timetable.refresh() : undefined),
    syncActivities: () => services.garmin?.syncActivities(),
    syncRecovery: () => services.garmin?.syncRecovery(),
    morningDecision: () => services.plan.morningDecision(),
    buildNextWeek: () => services.plan.buildNextWeek(() => services.review.notice()),
    syncWatch: () => services.garmin?.syncWatch(),
    backup: () => undefined,
  });
  const scheduler = new Scheduler(jobs, clock);

  const token = new URL(services.auth.createLoginLink("https://annarrive.test")).searchParams.get("token") ?? "";
  const login = await app.request("/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "sec-fetch-site": "same-origin" },
    body: new URLSearchParams({ token }).toString(),
  });
  const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";

  /** One request as the app sends it; the body is read whole (SSE included) before the time stops. */
  async function call(method: string, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit = {
      method,
      headers: { cookie, "content-type": "application/json", "sec-fetch-site": "same-origin" },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const started = performance.now();
    const response = await app.request(path, init);
    const text = await response.text();
    const ms = performance.now() - started;
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      // SSE from /api/chat: kept as text.
    }
    return { status: response.status, json, ms };
  }

  return {
    db,
    stores: createStores(db),
    services,
    garmin,
    call,
    scheduler,
    now: local,
    setNow(instant: Date) {
      now = instant;
    },
    instant: () => now,
    setTimetable(version: 1 | 2) {
      ics = version;
    },
    timetableVersion: () => ics,
    askReggie(next: ReggieAsk) {
      ask = next;
    },
  };
}
export type World = Awaited<ReturnType<typeof createWorld>>;
