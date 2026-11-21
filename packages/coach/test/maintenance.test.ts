import { describe, expect, it } from "vitest";
import {
  exitMaintenance,
  isHard,
  maintenanceVolume,
  maintenanceWeek,
  postRaceWeek,
  stopProgram,
} from "../src/index.ts";
import { P40, SETTINGS } from "./fixtures.ts";

const fitness = { paces: P40 };
const qOf = (week: ReturnType<typeof maintenanceWeek>) => week.filter((s) => isHard(s) && s.type !== "L");

describe("maintenance (M9)", () => {
  it("runs half of 200 min in 3 runs with one Q (MA-1)", () => {
    const w = maintenanceWeek(Array(8).fill(200), SETTINGS, 1, fitness);
    expect(maintenanceVolume(Array(8).fill(200))).toBe(100);
    expect(w).toHaveLength(3);
    expect(qOf(w)).toHaveLength(1);
  });

  it("never goes under 90 min (MA-2)", () => {
    expect(maintenanceVolume(Array(8).fill(120))).toBe(90);
  });

  it("rotates the Q T, I, fartlek, T (MA-3)", () => {
    const three = { ...SETTINGS, runsPerWeek: 3 as const };
    expect([1, 2, 3, 4].map((i) => maintenanceWeek([180], three, i, fitness)[0]?.type)).toEqual([
      "T",
      "I",
      "FARTLEK",
      "T",
    ]);
  });

  it("caps an optional long run at 40 % of 100 min (MA-4)", () => {
    const l = maintenanceWeek(Array(8).fill(200), SETTINGS, 1, fitness, true).find((s) => s.type === "L");
    expect(l?.durMin).toBeLessThanOrEqual(40);
  });

  it("never uses more than three runs", () => {
    expect(maintenanceWeek([200], { ...SETTINGS, runsPerWeek: 5 }, 1, fitness)).toHaveLength(3);
  });

  it("keeps 20 min footings after a race when no run is known (MA-7)", () => {
    expect(postRaceWeek(0, P40, 21097.5).map((s) => s.durMin)).toEqual([20, 20, 20]);
  });

  it("starts the plan next Monday from the maintenance mean (MA-6)", () => {
    expect(exitMaintenance([100, 110, 95, 105], "2026-11-16T09:00")).toEqual({ v0: 102.5, planStart: "2026-11-23" });
  });

  it("switches to maintenance next Monday when the programme stops (MA8)", () => {
    expect(stopProgram("2026-11-18T09:00")).toEqual({ maintenanceFrom: "2026-11-23" });
  });
});
