import { buildSession, paces } from "@annarrive/coach";
import {
  changeResponseSchema,
  type GarminActivity,
  type GarminLap,
  type PlannedSession,
  programViewSchema,
  proposalSchema,
} from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { coachAdapter } from "../src/coach-adapter.ts";
import { toLaps } from "../src/services/garmin.ts";
import { levelReport } from "../src/services/level.ts";
import { fakeBridge, setup } from "./helpers.ts";

const NOW = "2026-11-16T08:00";

async function ready(options: Parameters<typeof setup>[0] = {}) {
  const t = setup({ coach: coachAdapter, ...options });
  await t.login();
  return t;
}

const lap = (minPerKm: number, avgHr: number): GarminLap => ({
  durationS: minPerKm * 60,
  distanceM: 1000,
  avgSpeedMps: null,
  avgHr,
});
/** Anna's kind of tempo: 2 km easy, 4 km at 5:15 near 88 % of HRmax, 1 km easy. */
const tempoLaps = [lap(6.67, 140), lap(6.67, 146), ...Array.from({ length: 4 }, () => lap(5.25, 170)), lap(6.8, 150)];
const tempoRun = (id: number, start: string): GarminActivity => ({
  id,
  type: "running",
  startTimeLocal: start,
  startTimeGmt: null,
  durationS: tempoLaps.reduce((s, l) => s + (l.durationS ?? 0), 0),
  distanceM: 7000,
  avgSpeedMps: null,
  avgPaceSPerKm: null,
  avgHr: 158,
  maxHr: 192,
  elevationGainM: 0,
  feel: null,
  rpe: null,
});

describe("her level from laps and her own time (F10, F18, RC3)", () => {
  it("keeps the laps that say something about pace", () => {
    expect(
      toLaps([
        lap(5, 160),
        { durationS: 0, distanceM: 1000, avgSpeedMps: null, avgHr: null },
        { ...lap(6, 150), avgHr: null },
      ]),
    ).toEqual([
      { durMin: 5, distM: 1000, avgHr: 160 },
      { durMin: 6, distM: 1000 },
    ]);
  });

  it("reads the threshold laps of a sync and proposes them over a low provisional VO2max", async () => {
    const bridge = fakeBridge();
    const t = await ready({ bridge });
    const garmin = t.services.garmin;
    if (!garmin) throw new Error("garmin service missing");
    t.stores.fitnessEstimate.put({
      id: "2026-11-01",
      date: "2026-11-01",
      vdot: 34,
      source: "garmin_vo2max",
      provisional: true,
    });
    bridge.recentActivities.mockResolvedValue([tempoRun(5, "2026-11-14 18:00:00")]);
    bridge.activityLaps.mockResolvedValue(tempoLaps);
    await garmin.syncActivities();

    expect(t.stores.activity.get("garmin:5")?.laps).toHaveLength(7);
    const pending = z.array(proposalSchema).parse((await t.call("GET", "/api/proposals")).json);
    expect(pending[0]).toMatchObject({ ruleId: "F10", from: 34 });
    const t2 = paces(pending[0]?.to ?? 0).T;
    expect(t2).toBeGreaterThanOrEqual(310);
    expect(t2).toBeLessThanOrEqual(320);

    const report = levelReport(t.stores, NOW);
    expect(report).toContain("seuil (FC)");
    expect(report).toMatch(/T 5'1\d \/km/);
  });

  it("takes a time she types in Programme at once, the goal untouched", async () => {
    const t = await ready();
    const goal = { distanceM: 21097.5, date: "2027-03-14" };
    await t.call("PUT", "/api/program", { goal });
    t.stores.fitnessEstimate.put({
      id: "2026-11-01",
      date: "2026-11-01",
      vdot: 34,
      source: "test",
      provisional: false,
    });
    const response = await t.call("PUT", "/api/program", {
      declaredTime: { distanceM: 21097.5, minutes: 110, date: "2026-10-04" },
    });
    expect(changeResponseSchema.parse(response.json).change?.summary).toBe("Allures recalculées avec ton chrono");
    expect(t.stores.fitnessEstimate.list().at(-1)?.vdot).toBeCloseTo(40.38, 1);
    expect(programViewSchema.parse((await t.call("GET", "/api/program")).json).goal).toEqual(goal);
  });

  it("proposes what clearly faster T laps prove, without waiting 28 days (RC3)", async () => {
    const t = await ready();
    t.stores.fitnessEstimate.put({
      id: "2026-11-06",
      date: "2026-11-06",
      vdot: 34,
      source: "test",
      provisional: false,
    });
    const target = paces(34).T;
    const fast = Array.from({ length: 4 }, () => ({ durMin: target / 1.06 / 60, distM: 1000 }));
    const done = ["2026-11-10", "2026-11-13"].map((day, i) => {
      const s = buildSession("T", { weeklyMin: 200, paces: paces(34), phase: "dev", progressionStep: 0, distM: 10000 });
      const session: PlannedSession = { ...s, id: `t${i}`, start: `${day}T18:00` };
      return { session, activity: { id: `a${i}`, start: `${day}T18:00`, durMin: 40, distM: 7000, laps: fast } };
    });
    const p = coachAdapter.evaluateKeySessions(t.services.plan.coachState(), done, [], NOW);
    expect(p?.ruleId).toBe("RC3");
    expect(p?.to).toBeGreaterThan(35);
  });
});
