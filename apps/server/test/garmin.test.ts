import { type DailySignal, type GarminActivity, todaySchema, weekSchema } from "@talaria/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CoachPort } from "../src/coach-port.ts";
import { BridgeError, BridgeUnreachableError, GarminRateLimitError } from "../src/garmin/bridge-client.ts";
import { workoutHash } from "../src/garmin/workout.ts";
import { toActivity } from "../src/services/garmin.ts";
import { fakeBridge, fakeCoach, session, setup } from "./helpers.ts";

function garminRun(id: number, startTimeLocal: string, over: Partial<GarminActivity> = {}): GarminActivity {
  return {
    id,
    type: "running",
    startTimeLocal,
    startTimeGmt: null,
    durationS: 2700,
    distanceM: 7500,
    avgSpeedMps: null,
    avgPaceSPerKm: null,
    avgHr: 148,
    maxHr: null,
    elevationGainM: null,
    feel: null,
    rpe: null,
    ...over,
  };
}

function garminSetup(coach: CoachPort = fakeCoach) {
  const bridge = fakeBridge();
  const send = vi.fn(async () => undefined);
  const t = setup({ bridge, coach, push: { send, publicKey: "key" } });
  t.services.notifications.subscribe({ endpoint: "https://push.test/anna", keys: { p256dh: "p", auth: "a" } });
  const garmin = t.services.garmin;
  if (!garmin) throw new Error("garmin service missing");
  return { ...t, bridge, send, garmin };
}

const sentTitles = (send: ReturnType<typeof vi.fn>) =>
  send.mock.calls.map((call: unknown[]) => JSON.parse(String(call[1])).title);

afterEach(() => vi.restoreAllMocks());

describe("Garmin activities", () => {
  it("converts a Garmin run, keeping feel and RPE when the watch asked for them", () => {
    expect(toActivity(garminRun(7, "2026-11-16 07:05:12", { feel: 25, rpe: 70, elevationGainM: 40 }))).toEqual({
      id: "garmin:7",
      start: "2026-11-16T07:05",
      durMin: 45,
      distM: 7500,
      avgHr: 148,
      elevGainM: 40,
      feel: "hard",
      rpe: 7,
    });
    expect(toActivity(garminRun(8, "2026-11-16 07:05:12", { feel: 100 }))?.feel).toBe("easy");
    expect(toActivity(garminRun(9, "2026-11-16 07:05:12", { feel: 50, avgHr: null }))).toMatchObject({ feel: "ok" });
    expect(toActivity(garminRun(10, "2026-11-16 07:05:12", { durationS: null }))).toBeNull();
  });

  it("attaches each run to the planned session of the same day that starts closest, and marks it done", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("morning", "2026-11-15T08:00"));
    t.stores.plannedSession.put(session("evening", "2026-11-15T18:00"));
    t.stores.plannedSession.put(session("monday", "2026-11-16T18:00"));
    t.bridge.recentActivities.mockResolvedValue([
      garminRun(1, "2026-11-15 17:20:00"),
      garminRun(2, "2026-11-15 12:00:00", { type: "cycling" }),
    ]);

    await t.garmin.syncActivities();

    expect(t.stores.activity.get("garmin:1")?.sessionId).toBe("evening");
    expect(t.stores.activity.get("garmin:2")).toBeUndefined();
    expect(t.stores.plannedSession.get("evening")?.status).toBe("done");
    expect(t.stores.plannedSession.get("morning")?.status).toBe("planned");
    expect(t.stores.plannedSession.get("monday")?.status).toBe("planned");
  });

  it("records the match as a change, so Annuler reopens the session", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("evening", "2026-11-15T18:00"));
    t.bridge.recentActivities.mockResolvedValue([garminRun(1, "2026-11-15 18:10:00")]);

    await t.garmin.syncActivities();
    const [entry] = t.stores.changeLog.list();
    t.services.changes.undo(entry?.id ?? "");

    expect(entry?.summary).toBe("Course synchronisée");
    expect(t.stores.plannedSession.get("evening")?.status).toBe("planned");
  });

  it("keeps a run without a planned session, and does not match twice on the next poll", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("evening", "2026-11-15T18:00"));
    t.bridge.recentActivities.mockResolvedValue([
      garminRun(1, "2026-11-15 18:00:00"),
      garminRun(2, "2026-11-15 20:00:00"),
    ]);

    await t.garmin.syncActivities();
    await t.garmin.syncActivities();

    expect(t.stores.activity.get("garmin:2")?.sessionId).toBeUndefined();
    expect(t.stores.changeLog.list()).toHaveLength(1);
  });

  it("invites a note once for a run synced today, never for older runs", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("today", "2026-11-16T07:00"));
    t.bridge.recentActivities.mockResolvedValue([
      garminRun(1, "2026-11-16 07:10:00"),
      garminRun(2, "2026-11-14 18:00:00"),
    ]);

    await t.garmin.syncActivities();
    await t.garmin.syncActivities();

    expect(sentTitles(t.send)).toEqual(["Course enregistrée"]);
  });

  it("shows today's run and keeps Anna's feel answer across the next polls", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("today", "2026-11-16T07:00"));
    t.bridge.recentActivities.mockResolvedValue([garminRun(1, "2026-11-16 07:10:00")]);
    await t.garmin.syncActivities();
    await t.login();

    expect(await t.call("POST", "/api/activities/garmin:1/feel", { feel: "hard" })).toEqual({
      status: 204,
      json: null,
    });
    await t.garmin.syncActivities();

    const today = todaySchema.parse((await t.call("GET", "/api/today")).json);
    expect(today.activity).toEqual({
      id: "garmin:1",
      start: "2026-11-16T07:10",
      durMin: 45,
      distM: 7500,
      answeredFeel: "hard",
      sessionId: "today",
    });
  });

  it("never overwrites the feel the watch recorded, and refuses an unknown run or answer", async () => {
    const t = garminSetup();
    t.bridge.recentActivities.mockResolvedValue([garminRun(1, "2026-11-16 07:10:00", { feel: 100 })]);
    await t.garmin.syncActivities();
    await t.login();

    expect((await t.call("POST", "/api/activities/garmin:1/feel", { feel: "hard" })).status).toBe(403);
    expect((await t.call("POST", "/api/activities/nope/feel", { feel: "hard" })).status).toBe(404);
    expect((await t.call("POST", "/api/activities/garmin:1/feel", { feel: "terrible" })).status).toBe(400);
  });

  it("asks the coach after a feel answer and stores its RC5 proposal once", async () => {
    const evaluateFeels = vi.fn<CoachPort["evaluateFeels"]>((st) =>
      st.feels.length > 0
        ? { kind: "vdot", from: 40, to: 39, ruleId: "RC5", evidence: [], expiresOn: "2026-11-30" }
        : null,
    );
    const t = garminSetup({ ...fakeCoach, evaluateFeels });
    t.stores.plannedSession.put(session("today", "2026-11-16T07:00"));
    t.bridge.recentActivities.mockResolvedValue([garminRun(1, "2026-11-16 07:10:00")]);
    await t.garmin.syncActivities();

    t.services.fitness.logFeel("garmin:1", "hard");
    t.services.fitness.logFeel("garmin:1", "hard");

    expect(evaluateFeels.mock.calls[0]?.[0].feels).toEqual([
      { sessionId: "today", date: "2026-11-16", feel: "hard", rpeTarget: 3 },
    ]);
    expect(t.services.fitness.pending().map((p) => p.ruleId)).toEqual(["RC5"]);
  });

  it("gives the watch's last sync time, null before the first one", async () => {
    const t = garminSetup();
    await t.login();
    expect((await t.call("GET", "/api/watch")).json).toEqual({ configured: true, lastSyncAt: null });

    await t.garmin.syncActivities();

    expect((await t.call("GET", "/api/watch")).json).toEqual({
      configured: true,
      lastSyncAt: "2026-11-16T07:00:00.000Z",
    });
    const plain = setup();
    await plain.login();
    expect((await plain.call("GET", "/api/watch")).json).toEqual({ configured: false, lastSyncAt: null });
  });
});

describe("Garmin recovery and morning decision", () => {
  const shorteningCoach = (seen: DailySignal[][]): CoachPort => ({
    ...fakeCoach,
    dailyDecision: (st, signals) => {
      seen.push(signals);
      const sessions = st.sessions.map((s) => (s.start.startsWith("2026-11-16") ? { ...s, durMin: 30 } : s));
      return { state: { ...st, sessions }, changes: [], warnings: [], action: "shorter" };
    },
  });

  it("stores only the fields Garmin had, and keeps polling while the night is not in", async () => {
    const seen: DailySignal[][] = [];
    const t = garminSetup(shorteningCoach(seen));
    t.stores.plannedSession.put(session("today", "2026-11-16T18:00"));
    t.bridge.dailySignals.mockResolvedValueOnce({
      date: "2026-11-16",
      sleepS: null,
      sleepScore: null,
      restingHr: 51,
      stressAvg: null,
      bodyBatteryAtWake: 80,
      bodyBatteryHighest: null,
      vo2Max: null,
    });

    await t.garmin.syncRecovery();

    expect(t.stores.dailySignal.get("2026-11-16")).toEqual({ id: "2026-11-16", rhr: 51, bodyBatteryWake: 80 });
    expect(seen).toHaveLength(0);
    expect(t.stores.plannedSession.get("today")?.frozen).toBe(false);
  });

  it("decides right after the sleep arrives, freezes today's session and stops polling", async () => {
    const seen: DailySignal[][] = [];
    const t = garminSetup(shorteningCoach(seen));
    t.stores.plannedSession.put(session("today", "2026-11-16T18:00"));
    t.stores.dailySignal.put({ id: "2026-11-16", rhr: 51 });
    t.bridge.dailySignals.mockImplementation(async (date) => ({
      date,
      sleepS: date === "2026-11-16" ? 27_000 : null,
      sleepScore: null,
      restingHr: null,
      stressAvg: date === "2026-11-15" ? 31 : null,
      bodyBatteryAtWake: null,
      bodyBatteryHighest: null,
      vo2Max: null,
    }));

    await t.garmin.syncRecovery();
    await t.garmin.syncRecovery();

    expect(t.bridge.dailySignals.mock.calls.map(([date]) => date)).toEqual(["2026-11-16", "2026-11-15"]);
    expect(seen).toEqual([
      [
        { id: "2026-11-15", stressAvg: 31 },
        { id: "2026-11-16", rhr: 51, sleepMin: 450 },
      ],
    ]);
    expect(t.stores.plannedSession.get("today")).toMatchObject({ durMin: 30, frozen: true });
    expect(t.stores.changeLog.list().map((c) => c.summary)).toEqual(["Séance du jour raccourcie"]);
  });

  it("decides at 10:00 with what it has when the sleep never came, once a day", async () => {
    const seen: DailySignal[][] = [];
    const t = garminSetup(shorteningCoach(seen));
    t.stores.plannedSession.put(session("today", "2026-11-16T18:00"));
    t.setNow(new Date("2026-11-16T09:00:00Z"));

    expect(t.services.plan.morningDecision()?.change?.summary).toBe("Séance du jour raccourcie");
    expect(t.services.plan.morningDecision()).toBeNull();
    expect(seen).toEqual([[]]);
  });

  it("only freezes the session when the pass-through coach changes nothing", () => {
    const t = setup();
    t.stores.plannedSession.put(session("today", "2026-11-16T18:00"));
    expect(t.services.plan.morningDecision()?.change?.summary).toBe("Séance du jour confirmée");
    expect(t.stores.plannedSession.get("today")).toMatchObject({ durMin: 45, frozen: true });
  });

  it("does nothing on a rest day", () => {
    const t = setup();
    expect(t.services.plan.morningDecision()).toBeNull();
    expect(t.stores.changeLog.list()).toEqual([]);
  });
});

describe("watch sync", () => {
  it("creates a workout for each planned session of the next 7 days and shows it on the watch", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    t.stores.plannedSession.put(session("far", "2026-11-23T18:00"));
    t.stores.plannedSession.put(session("done", "2026-11-16T07:00", { status: "done" }));
    t.bridge.createWorkout.mockResolvedValue({ workoutId: 501 });
    await t.login();
    expect(weekSchema.parse((await t.call("GET", "/api/weeks/2026-W47")).json).days[1]?.sessions[0]?.watch).toBe(
      "pending",
    );

    await t.garmin.syncWatch();

    expect(t.bridge.createWorkout).toHaveBeenCalledTimes(1);
    expect(t.bridge.createWorkout).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Footing", date: "2026-11-17" }),
    );
    expect(t.stores.watchSync.get("tue")).toMatchObject({ status: "sent", workoutId: 501 });
    const week = weekSchema.parse((await t.call("GET", "/api/weeks/2026-W47")).json);
    expect(week.days[1]?.sessions[0]?.watch).toBe("sent");
    expect(week.days[0]?.sessions[0]?.watch).toBeNull();
  });

  it("uploads nothing when the watch already has the same content", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    await t.garmin.syncWatch();
    await t.garmin.syncWatch();
    expect(t.bridge.createWorkout).toHaveBeenCalledTimes(1);
  });

  it("replaces the workout when the session changes day", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    t.bridge.createWorkout.mockResolvedValueOnce({ workoutId: 1 }).mockResolvedValueOnce({ workoutId: 2 });
    await t.garmin.syncWatch();
    await t.login();
    await t.call("POST", "/api/sessions/tue/move", { start: "2026-11-18T18:00" });

    await t.garmin.syncWatch();

    expect(t.bridge.deleteWorkout).toHaveBeenCalledWith(1);
    expect(t.bridge.createWorkout).toHaveBeenLastCalledWith(expect.objectContaining({ date: "2026-11-18" }));
    expect(t.stores.watchSync.get("tue")).toMatchObject({ status: "sent", workoutId: 2 });
  });

  it("moves the last sync time only when every session reached the watch", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    t.bridge.createWorkout.mockRejectedValueOnce(new BridgeError("Bridge Garmin : réponse 500", 500));

    await t.garmin.syncWatch();
    expect(t.garmin.lastSyncAt()).toBeNull();
    await t.garmin.syncWatch();
    expect(t.garmin.lastSyncAt()).toBe("2026-11-16T07:00:00.000Z");
  });

  it("marks the session failed when the bridge is unreachable, then sends it on the next run", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    t.stores.plannedSession.put(session("wed", "2026-11-18T18:00"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    t.bridge.createWorkout.mockRejectedValueOnce(new BridgeUnreachableError("Bridge Garmin injoignable"));

    await t.garmin.syncWatch();

    expect(t.bridge.createWorkout).toHaveBeenCalledTimes(1);
    expect(t.stores.watchSync.get("tue")?.status).toBe("failed");
    await t.login();
    const today = todaySchema.parse((await t.call("GET", "/api/today")).json);
    expect(today.session).toBeNull();
    const week = weekSchema.parse((await t.call("GET", "/api/weeks/2026-W47")).json);
    expect(week.days[1]?.sessions[0]?.watch).toBe("failed");

    await t.garmin.syncWatch();

    expect(t.stores.watchSync.get("tue")?.status).toBe("sent");
    expect(t.stores.watchSync.get("wed")?.status).toBe("sent");
  });

  it("stops at a Garmin rate limit, but goes on after an error tied to one session", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    t.stores.plannedSession.put(session("wed", "2026-11-18T18:00"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    t.bridge.createWorkout.mockRejectedValueOnce(new GarminRateLimitError(60));
    await t.garmin.syncWatch();
    expect(t.stores.watchSync.get("wed")).toBeUndefined();

    t.bridge.createWorkout.mockRejectedValueOnce(new BridgeError("Bridge Garmin : réponse 422", 422));
    await t.garmin.syncWatch();
    expect(t.stores.watchSync.get("tue")?.status).toBe("failed");
    expect(t.stores.watchSync.get("wed")?.status).toBe("sent");
  });

  it("forgets the old workout id once deleted, even if the new upload fails", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00", { durMin: 50 }));
    t.stores.watchSync.put({ id: "tue", status: "sent", hash: "old", workoutId: 9 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    t.bridge.createWorkout.mockRejectedValueOnce(new GarminRateLimitError(null));

    await t.garmin.syncWatch();

    expect(t.bridge.deleteWorkout).toHaveBeenCalledWith(9);
    expect(t.stores.watchSync.get("tue")).toEqual({ id: "tue", status: "failed", hash: expect.any(String) });
  });

  it("removes the workout of a session deleted, cancelled or moved past the 7 days", async () => {
    const t = garminSetup();
    const far = session("far", "2026-11-25T18:00");
    t.stores.plannedSession.put(far);
    t.stores.plannedSession.put(session("cancelled", "2026-11-18T18:00", { status: "cancelled" }));
    t.stores.plannedSession.put(session("done", "2026-11-15T18:00", { status: "done" }));
    t.stores.watchSync.put({ id: "gone", status: "sent", hash: "h", workoutId: 1 });
    t.stores.watchSync.put({ id: "far", status: "sent", hash: workoutHash(far), workoutId: 2 });
    t.stores.watchSync.put({ id: "cancelled", status: "failed", hash: "h" });
    t.stores.watchSync.put({ id: "done", status: "sent", hash: "h", workoutId: 4 });

    await t.garmin.syncWatch();

    expect(t.bridge.deleteWorkout.mock.calls.flat().sort()).toEqual([1, 2]);
    expect(t.stores.watchSync.list().map((s) => s.id)).toEqual(["done"]);
  });

  it("leaves stale workouts for the next run when the bridge is down", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    t.stores.watchSync.put({ id: "gone", status: "sent", hash: "h", workoutId: 1 });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    t.bridge.deleteWorkout.mockRejectedValueOnce(new BridgeUnreachableError("Bridge Garmin injoignable"));

    await t.garmin.syncWatch();

    expect(t.stores.watchSync.get("gone")).toBeDefined();
    expect(t.bridge.createWorkout).not.toHaveBeenCalled();
  });

  it("never runs two syncs at once", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    let release = () => {};
    t.bridge.createWorkout.mockImplementationOnce(
      () => new Promise((resolve) => (release = () => resolve({ workoutId: 1 }))),
    );

    const first = t.garmin.syncWatch();
    await t.garmin.syncWatch();
    release();
    await first;

    expect(t.bridge.createWorkout).toHaveBeenCalledTimes(1);
  });

  it("retries on demand from the app, and says when no watch is linked", async () => {
    const t = garminSetup();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    await t.login();
    expect(await t.call("POST", "/api/watch/sync")).toEqual({ status: 204, json: null });
    expect(t.stores.watchSync.get("tue")?.status).toBe("sent");

    const plain = setup();
    await plain.login();
    expect(await plain.call("POST", "/api/watch/sync")).toEqual({
      status: 503,
      json: { error: "La montre n'est pas reliée : ajoute BRIDGE_URL et BRIDGE_SECRET aux variables du serveur." },
    });
  });
});
