import { buildSession, detrainingFactor, paces, vdot } from "@annarrive/coach";
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
import { fitnessHistory } from "../src/coach-port.ts";
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

/** Anna's real 12 weeks (level CLI of 2026-11-19): easy runs every 5 days, a half on 27/09, an 11 km tempo on 11/11. */
function annaRuns(): { runs: GarminActivity[]; laps: Map<number, GarminLap[]> } {
  const run = (id: number, start: string, km: number, min: number, avgHr: number, maxHr = 170): GarminActivity => ({
    ...tempoRun(id, start),
    durationS: min * 60,
    distanceM: km * 1000,
    avgHr,
    maxHr,
  });
  const easy = Array.from({ length: 16 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 7, 30 + i * 5)).toISOString().slice(0, 10);
    return run(1000 + i, `${day} 18:00:00`, 6, 40.5, 145);
  });
  const runs = [
    ...easy,
    run(24514776474, "2026-09-27 09:00:00", 21.27, 112.1, 166, 187),
    run(2001, "2026-10-04 09:00:00", 5.07, 26.43, 160),
    run(25045694091, "2026-11-11 18:00:00", 11.01, 60.62, 163),
  ].sort((a, b) => (a.startTimeLocal ?? "").localeCompare(b.startTimeLocal ?? ""));
  const tempo = [
    lap(6.4, 148),
    ...Array.from({ length: 9 }, () => lap(5.3, 168)),
    { ...lap(6.52, 150), distanceM: 1010 },
  ];
  return { runs, laps: new Map([[25045694091, tempo]]) };
}

/** Her half of 27/09 (VDOT 39.9) on 19/11, after a longest break of 6 days, since her last run (F11). */
const HALF_NOW = vdot(21270, 112.1) * detrainingFactor(6);

describe("Anna's level in service (F10, F11, RC11)", () => {
  const nov19 = new Date("2026-11-19T07:00:00Z");

  it("reads her first level once the whole sync is stored, not detrained by runs not stored yet (F-32)", async () => {
    const bridge = fakeBridge();
    const t = await ready({ bridge });
    t.setNow(nov19);
    const { runs, laps } = annaRuns();
    bridge.recentActivities.mockResolvedValue(runs);
    bridge.activityLaps.mockImplementation(async (id) => laps.get(id) ?? []);
    await t.services.garmin?.syncActivities();

    // F10: the higher of her 11 km tempo (38.1) and her half of 27/09, detrained by her longest real break.
    const level = t.stores.fitnessEstimate.list().at(-1);
    expect(level).toMatchObject({ source: "effort:garmin:24514776474:detrained", provisional: false });
    expect(level?.vdot).toBeCloseTo(HALF_NOW, 1);
  });

  it("proposes the better reading over a stale detrained level, names the run, and accepting it is undoable (RC-21)", async () => {
    const bridge = fakeBridge();
    const t = await ready({ bridge });
    t.setNow(nov19);
    const { runs, laps } = annaRuns();
    bridge.activityLaps.mockImplementation(async (id) => laps.get(id) ?? []);
    const stale = { id: "2026-11-17", date: "2026-11-17", vdot: 34.24, provisional: false };
    t.stores.fitnessEstimate.put({ ...stale, source: "effort:garmin:24514776474:detrained" });
    bridge.recentActivities.mockResolvedValue(runs);
    await t.services.garmin?.syncActivities();

    const [pending] = z.array(proposalSchema).parse((await t.call("GET", "/api/proposals")).json);
    expect(pending).toMatchObject({ ruleId: "F10", from: 34.24, proof: { date: "2026-09-27", distanceM: 21270 } });
    expect(pending?.to).toBeCloseTo(HALF_NOW, 1);
    expect(pending?.proof?.thresholdSKm).toBeCloseTo(paces(pending?.to ?? 0).T, 6);
    expect(levelReport(t.stores, "2026-11-19T08:00")).toContain("Pourquoi l'écart : une proposition attend sa réponse");

    const accepted = changeResponseSchema.parse((await t.call("POST", `/api/proposals/${pending?.id}/accept`)).json);
    expect(accepted.change?.summary).toBe("Allures mises à jour");
    expect(t.stores.fitnessEstimate.list().at(-1)).toMatchObject({ source: "proposal:F10" });
    await t.call("POST", `/api/changes/${accepted.change?.id}/undo`);
    expect(t.stores.fitnessEstimate.list().at(-1)?.vdot).toBe(34.24);
  });

  it("says why the level in service differs from today's reading", () => {
    const t = setup();
    t.stores.fitnessEstimate.put({
      id: "2026-11-17",
      date: "2026-11-17",
      vdot: 34.24,
      source: "effort:garmin:24514776474:detrained",
      provisional: false,
    });
    for (const a of [{ id: "garmin:1", start: "2026-11-11T18:00", durMin: 30, distM: 6500, avgHr: 185, maxHr: 190 }])
      t.stores.activity.put(a);
    expect(levelReport(t.stores, "2026-11-19T08:00")).toMatch(
      /Pourquoi l'écart : calculé le 2026-11-17 sur un effort de 6 à 12 semaines.*La prochaine course synchronisée/,
    );
  });
});

describe("HRmax of the year (F12)", () => {
  it("reads it on the year in the CLI as in the app, a wrist spike left out", () => {
    const t = setup();
    const run = (id: string, start: string, maxHr: number) =>
      t.stores.activity.put({ id, start, durMin: 40, distM: 7000, avgHr: 150, maxHr });
    run("spring", "2026-04-12T09:00", 192);
    run("summer", "2026-07-12T09:00", 190);
    run("spike", "2026-11-10T18:00", 214);
    expect(levelReport(t.stores, "2026-11-19T08:00")).toMatch(/FC max observée : 192/);
    expect(fitnessHistory(t.stores.activity.list(), undefined, undefined).hr).toEqual({ hrMax: 192 });
  });
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

  it("proposes one point of what clearly faster, easy T laps prove, 14 days after the last change (RC3)", async () => {
    const t = await ready();
    t.stores.fitnessEstimate.put({
      id: "2026-11-01",
      date: "2026-11-01",
      vdot: 34,
      source: "test",
      provisional: false,
    });
    const target = paces(34).T;
    const fast = Array.from({ length: 4 }, () => ({ durMin: target / 1.06 / 60, distM: 1000 }));
    const done = ["2026-11-10", "2026-11-13"].map((day, i) => {
      const s = buildSession("T", { weeklyMin: 200, paces: paces(34), phase: "dev", progressionStep: 0, distM: 10000 });
      const session: PlannedSession = { ...s, id: `t${i}`, start: `${day}T18:00` };
      const activity = {
        id: `a${i}`,
        start: `${day}T18:00`,
        durMin: 40,
        distM: 7000,
        laps: fast,
        feel: "easy" as const,
      };
      return { session, activity };
    });
    const p = coachAdapter.evaluateKeySessions(t.services.plan.coachState(), done, [], NOW);
    expect(p).toMatchObject({ ruleId: "RC3", to: 35 });
    if (!p) throw new Error("no proposal");
    // Accepted yesterday: the same laps never prove it again (RC8, no ratchet).
    const accepted = { ...p, id: "p", status: "accepted" as const, decidedOn: "2026-11-15" };
    expect(coachAdapter.evaluateKeySessions(t.services.plan.coachState(), done, [accepted], NOW)).toBeNull();
  });
});
