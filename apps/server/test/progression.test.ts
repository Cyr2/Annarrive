import { progressionSchema } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { coachAdapter } from "../src/coach-adapter.ts";
import { session, setup } from "./helpers.ts";

const GOAL = { distanceM: 21097.5, date: "2027-03-14", targetMin: 108 } as const;

/** Monday 16 November: a programme begun Monday 2, three levels, two weeks of runs. */
async function anna(goal: typeof GOAL | null = GOAL) {
  const t = setup({ coach: coachAdapter });
  await t.login();
  t.stores.program.put({ id: "current", value: { goal, startedOn: "2026-11-02" } });
  t.stores.fitnessEstimate.put({ id: "2026-10-20", date: "2026-10-20", vdot: 38, source: "declared" });
  t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "effort:a1:detrained" });
  t.stores.fitnessEstimate.put({ id: "2026-11-12", date: "2026-11-12", vdot: 41, source: "proposal:RC3" });
  for (const s of [
    session("a", "2026-11-03T18:00", { durMin: 50, status: "done" }),
    session("b", "2026-11-05T18:00", { durMin: 50, status: "done" }),
    session("c", "2026-11-10T18:00", { durMin: 40, status: "skipped" }),
    session("d", "2026-11-16T18:00", { durMin: 45 }),
    session("e", "2026-11-19T18:00", { durMin: 60, type: "T" }),
  ])
    t.stores.plannedSession.put(s);
  t.stores.activity.put({ id: "r1", start: "2026-11-03T18:02", durMin: 48, distM: 8000, sessionId: "a" });
  t.stores.activity.put({ id: "r2", start: "2026-11-05T18:00", durMin: 30, distM: 5000, sessionId: "b" });
  t.stores.activity.put({ id: "r3", start: "2026-11-11T07:00", durMin: 35, distM: 6000 });
  t.stores.activity.put({ id: "a1", start: "2026-10-14T18:30", durMin: 50, distM: 9500 });
  return t;
}

async function read(t: Awaited<ReturnType<typeof anna>>) {
  const response = await t.request("GET", "/api/progression");
  expect(response.status).toBe(200);
  return progressionSchema.parse(await response.json());
}

describe("GET /api/progression (algo.md M12)", () => {
  it("gives her estimate, the weeks of the plan, the runs kept and each level change explained", async () => {
    const p = await read(await anna());
    if (!p) throw new Error("no progression");
    expect(Math.round(p.currentMin * 60)).toBe(6515);
    expect(p.targetMin).toBe(108);
    const [w1, w2, w3, w4] = p.weeks;
    expect(p.weeks.length).toBeGreaterThan(12);
    expect(w1).toMatchObject({ monday: "2026-11-02", plannedMin: 100, doneMin: 78 });
    expect(Math.round((w1?.estimateMin ?? 0) * 60)).toBe(6654);
    expect(w2).toMatchObject({ monday: "2026-11-09", plannedMin: 40, doneMin: 35 });
    expect(Math.round((w2?.estimateMin ?? 0) * 60)).toBe(6515);
    expect(w3).toMatchObject({ monday: "2026-11-16", plannedMin: 105, doneMin: 0 });
    expect(w4?.estimateMin).toBeUndefined();
    expect(w4?.plannedMin).toBeGreaterThan(0);
    expect(p.kept).toEqual({ kept: 1, total: 3 });
    expect(p.changes).toEqual([
      {
        date: "2026-11-12",
        start: false,
        line: "Seuil et fractionné plus rapides que prévu : footing à 6'01 /km au lieu de 6'08 /km.",
      },
      {
        date: "2026-11-01",
        start: true,
        // Audit parcours réel F1: a tempo, not « Ta meilleure course », which she took for her marathon.
        line: "Ta sortie du 14 octobre, moins la coupure : temps estimé 1:50:54.",
      },
    ]);
  });

  it("is null in maintenance mode", async () => {
    expect(await read(await anna(null))).toBeNull();
  });
});
