import { addDays, paces } from "@annarrive/coach";
import { levelSchema } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { coachAdapter } from "../src/coach-adapter.ts";
import { session, setup } from "./helpers.ts";

const HALF = 21097.5;
const T = paces(40).T;
/** 1 km laps at her T pace: the first one is the warm-up minutes, the next three are read (NV3). */
const tempo = (hr: number) => [hr - 10, hr, hr, hr].map((avgHr) => ({ durMin: T / 60, distM: 1000, avgHr }));

/** Monday 16 November: level 40 from her half in 1:51, a goal half. */
async function anna() {
  const t = setup({ coach: coachAdapter });
  await t.login();
  t.stores.program.put({
    id: "current",
    value: {
      goal: { distanceM: HALF, date: "2027-03-14", targetMin: 108 },
      declaredTime: { distanceM: HALF, minutes: 111 },
    },
  });
  t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "declared" });
  return t;
}

async function read(t: Awaited<ReturnType<typeof anna>>) {
  const response = await t.request("GET", "/api/level");
  expect(response.status).toBe(200);
  return levelSchema.parse(await response.json());
}

describe("GET /api/level (algo.md M13)", () => {
  it("gives her VO2max next to her race (F19), her T pace, no threshold heart rate and no marathon yet", async () => {
    const t = await anna();
    t.stores.dailySignal.put({ id: "2026-11-15", vo2max: 45 });
    const level = await read(t);
    expect(level).toMatchObject({
      provisional: false,
      since: "2026-11-01",
      // 45 against a half in 1:51 (VDOT 40.0): 5 points, « au-dessus », never « en accord ».
      vo2max: { value: 45, date: "2026-11-15", versus: "above", raceDistanceM: HALF },
      goalDistanceM: HALF,
    });
    expect(level?.thresholdPace).toBeCloseTo(T);
    expect(level?.thresholdHr).toBeUndefined();
    expect(level?.predictions.map((p) => p.distanceM)).toEqual([5000, 10000, HALF, 42195]);
    expect(level?.predictions[3]).toEqual({ distanceM: 42195 });
  });

  it("reads her threshold heart rate from her laps at T pace in two sessions, and a 30 min test first", async () => {
    const t = await anna();
    t.stores.activity.put({ id: "a", start: "2026-11-05T18:00", durMin: 21, distM: 4000, laps: tempo(170) });
    t.stores.activity.put({ id: "b", start: "2026-11-12T18:00", durMin: 21, distM: 4000, laps: tempo(174) });
    expect((await read(t))?.thresholdHr).toEqual({ bpm: 172, from: "laps", date: "2026-11-12" });
    t.stores.plannedSession.put(session("s", "2026-11-14T09:00", { type: "TEST", durMin: 30, status: "done" }));
    const hrSeries = Array.from({ length: 30 }, () => 176);
    t.stores.activity.put({ id: "c", start: "2026-11-14T09:00", durMin: 30, distM: 6000, sessionId: "s", hrSeries });
    expect((await read(t))?.thresholdHr).toEqual({ bpm: 176, from: "test", date: "2026-11-14" });
  });

  it("gives a marathon time, a best case, on enough volume", async () => {
    const t = await anna();
    // 160 min a week for 8 weeks: some volume, not F6's 240.
    for (let k = 0; k < 8; k++)
      t.stores.activity.put({
        id: `l${k}`,
        start: `${addDays("2026-11-15", -7 * k)}T09:00`,
        durMin: 160,
        distM: 24000,
      });
    const marathon = (await read(t))?.predictions[3];
    expect(marathon?.bestCase).toBe(true);
    expect(Math.round((marathon?.min ?? 0) * 60)).toBe(13969);
  });

  it("counts no race as the long run or the volume a marathon time needs (NV2)", async () => {
    const t = await anna();
    // 180 min a week, none longer than 1 h: some volume, no long run of 1 h 15.
    for (let k = 0; k < 24; k++)
      t.stores.activity.put({ id: `e${k}`, start: `${addDays("2026-11-15", -2 * k)}T09:00`, durMin: 60, distM: 9000 });
    t.stores.activity.put({ id: "m", start: "2026-10-25T08:30", durMin: 246, distM: 42400, isRace: true });
    expect((await read(t))?.predictions[3]).toEqual({ distanceM: 42195 });
  });

  it("is null before her level is known", async () => {
    const t = setup({ coach: coachAdapter });
    await t.login();
    expect(await read(t)).toBeNull();
  });
});
