import { type GarminActivity, todaySchema } from "@annarrive/protocol";
import { describe, expect, it, vi } from "vitest";
import { fakeBridge, session, setup } from "./helpers.ts";

/** Paris wall clock (UTC+1 in November). */
const paris = (local: string) => new Date(`${local}:00+01:00`);

/** Anna's week of 16 to 22 November: three runs planned, two done, one run on Thursday. */
function weekSetup() {
  const t = setup();
  t.stores.plannedSession.put(session("tue", "2026-11-17T18:00", { status: "done" }));
  t.stores.plannedSession.put(session("thu", "2026-11-19T18:00", { status: "done", durMin: 60 }));
  t.stores.plannedSession.put(session("sun", "2026-11-22T09:30", { status: "skipped", type: "L", durMin: 90 }));
  t.stores.plannedSession.put(session("next", "2026-11-24T18:00"));
  t.stores.activity.put({ id: "r1", start: "2026-11-17T18:02", durMin: 46, distM: 7600, sessionId: "tue" });
  t.stores.activity.put({ id: "r2", start: "2026-11-19T18:01", durMin: 61, distM: 10200, sessionId: "thu" });
  return t;
}

const review = async (t: ReturnType<typeof setup>) =>
  todaySchema.parse((await t.call("GET", "/api/today")).json).review;

describe("le bilan du dimanche (BR7)", () => {
  it("shows on Sunday from 18:00 and all of Monday, never on another day", async () => {
    const t = weekSetup();
    await t.login();
    for (const [at, shown] of [
      ["2026-11-21T20:00", false],
      ["2026-11-22T17:59", false],
      ["2026-11-22T18:00", true],
      ["2026-11-23T23:30", true],
      ["2026-11-24T08:00", false],
    ] as const) {
      t.setNow(paris(at));
      expect(Boolean(await review(t)), at).toBe(shown);
    }
    t.setNow(paris("2026-11-22T20:00"));
    expect(await review(t)).toMatchObject({
      week: "2026-W47",
      monday: "2026-11-16",
      done: 2,
      planned: 3,
      minutes: 107,
    });
  });

  it("waits for a Sunday session that ends after 18:00", async () => {
    const t = weekSetup();
    t.stores.plannedSession.put(session("sun", "2026-11-22T18:00", { durMin: 45 }));
    await t.login();
    t.setNow(paris("2026-11-22T18:30"));
    expect(await review(t)).toBeUndefined();
    t.setNow(paris("2026-11-22T18:45"));
    expect(await review(t)).toBeDefined();
  });

  it("stays closed once she closes it, for that week only", async () => {
    const t = weekSetup();
    await t.login();
    t.setNow(paris("2026-11-22T20:00"));
    expect((await t.call("POST", "/api/review/dismiss", { week: "2026-W47" })).status).toBe(204);
    expect(await review(t)).toBeUndefined();
    t.setNow(paris("2026-11-23T08:00"));
    expect(await review(t)).toBeUndefined();
    t.stores.plannedSession.put(session("sun2", "2026-11-29T09:30", { status: "done" }));
    t.setNow(paris("2026-11-29T20:00"));
    expect(await review(t)).toMatchObject({ week: "2026-W48" });
    expect((await t.call("POST", "/api/review/dismiss", { week: "W48" })).status).toBe(400);
  });

  it("says nothing for a week with nothing planned and nothing run", async () => {
    const t = setup();
    await t.login();
    t.setNow(paris("2026-11-22T20:00"));
    expect(await review(t)).toBeUndefined();
  });

  it("puts the week in numbers in the Sunday notification and opens Aujourd'hui", async () => {
    const send = vi.fn(async () => undefined);
    const t = setup({ push: { send, publicKey: "key" } });
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00", { status: "done" }));
    t.stores.plannedSession.put(session("thu", "2026-11-19T18:00"));
    t.services.notifications.subscribe({ endpoint: "https://web.push.apple.com/a", keys: { p256dh: "p", auth: "a" } });
    t.setNow(paris("2026-11-22T18:00"));
    await t.services.plan.buildNextWeek(() => t.services.review.notice());
    expect(JSON.parse(String(send.mock.calls.at(0)?.at(1)))).toEqual({
      title: "Ta semaine est prête",
      body: "1 course sur 2 cette semaine. La suivante est prête.",
      url: "/",
    });
    t.stores.plannedSession.delete("tue");
    t.stores.plannedSession.delete("thu");
    expect(t.services.review.notice()).toBe("Ta semaine prochaine est prête.");
  });
});

const SEMI = { distanceM: 21097.5 as const, date: "2026-11-22", targetMin: 108 };
const raceRun = { id: "garmin:9", start: "2026-11-22T09:02", durMin: 107.53, distM: 21240 };

describe("après la course objectif (RR)", () => {
  it("shows the result on race day once the race is synced, until the goal changes", async () => {
    const t = setup();
    t.stores.program.put({
      id: "current",
      value: { goal: SEMI, declaredTime: { distanceM: 21097.5, minutes: 112, date: "2025-12-07" } },
    });
    await t.login();
    t.setNow(paris("2026-11-22T13:05"));
    const race = async () => todaySchema.parse((await t.call("GET", "/api/today")).json).race;
    expect(await race()).toBeUndefined();
    t.stores.activity.put({ id: "warmup", start: "2026-11-22T08:40", durMin: 12, distM: 2000 });
    expect(await race()).toBeUndefined();
    t.stores.activity.put(raceRun);
    expect(await race()).toMatchObject({ date: "2026-11-22", timeMin: 107.53, previous: { timeMin: 112 } });
    expect((await race())?.gapMin).toBeCloseTo(-0.47);
    t.setNow(paris("2026-11-24T08:00"));
    expect(await race()).toBeDefined();

    const kept = await t.call("POST", "/api/race/keep-fit");
    expect(kept.json).toMatchObject({ change: { summary: "Mode entretien : deux semaines faciles pour commencer" } });
    expect(t.stores.program.get("current")?.value.goal).toBeNull();
    expect(await race()).toBeUndefined();
  });

  it("marks the goal race at the sync, and only it", async () => {
    const bridge = fakeBridge();
    const t = setup({ bridge });
    t.stores.program.put({ id: "current", value: { goal: SEMI } });
    t.setNow(paris("2026-11-22T13:05"));
    const run = (id: number, start: string, distanceM: number): GarminActivity => ({
      id,
      type: "running",
      startTimeLocal: start,
      startTimeGmt: null,
      durationS: 6450,
      distanceM,
      avgSpeedMps: null,
      avgPaceSPerKm: null,
      avgHr: null,
      maxHr: null,
      elevationGainM: null,
      feel: null,
      rpe: null,
    });
    bridge.recentActivities.mockResolvedValue([
      run(1, "2026-11-22 08:40:00", 2000),
      run(2, "2026-11-22 09:02:00", 21240),
    ]);
    await t.services.garmin?.syncActivities();
    expect(t.stores.activity.get("garmin:1")?.isRace).toBeUndefined();
    expect(t.stores.activity.get("garmin:2")?.isRace).toBe(true);
  });
});
