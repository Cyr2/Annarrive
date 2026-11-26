import { describe, expect, it } from "vitest";
import { KEPT_SHARE, keptRuns, levelChanges, levelOn, weeklyEstimates, weekVolume } from "../src/index.ts";

const SEMI = 21097.5;
const LEVELS = [
  { date: "2026-10-20", vdot: 38, source: "declared" },
  { date: "2026-11-01", vdot: 40, source: "effort:a1" },
  { date: "2026-11-12", vdot: 41, source: "proposal:RC3" },
];
/** "1:50:54": minutes to the clock the table of algo.md gives. */
const clock = (min: number | undefined) => {
  if (min === undefined) return undefined;
  const s = Math.round(min * 60);
  return `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const run = (
  id: string,
  start: string,
  durMin: number,
  status: "planned" | "done" | "missed" | "skipped" | "cancelled",
) => ({
  id,
  start,
  durMin,
  status,
});

describe("progression (M12)", () => {
  it("reads the level in service on a day, the latest set on or before it (PR1)", () => {
    expect(levelOn(LEVELS, "2026-11-11")?.vdot).toBe(40);
    expect(levelOn(LEVELS, "2026-11-12")?.vdot).toBe(41);
    expect(levelOn(LEVELS, "2026-10-01")).toBeUndefined();
  });

  it("predicts the race at the end of each week begun, none ahead (PR-1)", () => {
    const mondays = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"];
    expect(weeklyEstimates(LEVELS, mondays, SEMI, "2026-11-18").map(clock)).toEqual([
      "1:50:54",
      "1:48:35",
      "1:48:35",
      undefined,
    ]);
    expect(weeklyEstimates(LEVELS, ["2026-11-09"], SEMI, "2026-11-11").map(clock)).toEqual(["1:50:54"]);
    expect(weeklyEstimates([], mondays, SEMI, "2026-11-18")).toEqual([undefined, undefined, undefined, undefined]);
  });

  it("counts planned minutes without cancelled runs and every run she synced (PR-2)", () => {
    const sessions = [
      run("e", "2026-11-16T18:00", 45, "done"),
      run("q", "2026-11-18T18:00", 50, "missed"),
      run("l", "2026-11-22T09:00", 80, "planned"),
      run("x", "2026-11-20T18:00", 40, "cancelled"),
      run("next", "2026-11-23T18:00", 40, "planned"),
    ];
    const runs = [
      { start: "2026-11-16T18:05", durMin: 47, sessionId: "e" },
      { start: "2026-11-19T07:00", durMin: 30 },
      { start: "2026-11-15T09:00", durMin: 70 },
    ];
    expect(weekVolume(sessions, runs, "2026-11-16")).toEqual({ plannedMin: 175, doneMin: 77 });
    expect(weekVolume([], [], "2026-11-30", 200)).toEqual({ plannedMin: 200, doneMin: 0 });
    expect(weekVolume(sessions, [], "2026-11-23", 200)).toEqual({ plannedMin: 40, doneMin: 0 });
  });

  it("keeps a run done for 80 % of its time or confirmed without the watch (PR-3)", () => {
    const sessions = [
      run("a", "2026-11-03T18:00", 50, "done"),
      run("b", "2026-11-05T18:00", 50, "done"),
      run("c", "2026-11-07T18:00", 40, "done"),
      run("d", "2026-11-09T18:00", 40, "missed"),
      run("e", "2026-11-10T18:00", 40, "skipped"),
      run("f", "2026-11-12T18:00", 40, "planned"),
      run("old", "2026-10-30T18:00", 40, "done"),
    ];
    const runs = [
      { start: "2026-11-03T18:00", durMin: KEPT_SHARE * 50, sessionId: "a" },
      { start: "2026-11-05T18:00", durMin: 39, sessionId: "b" },
    ];
    expect(keptRuns(sessions, runs, "2026-11-02")).toEqual({ kept: 2, total: 5 });
    expect(keptRuns([], [], "2026-11-02")).toEqual({ kept: 0, total: 0 });
  });

  it("lists her start level, then each change with the easy pace before and after (PR-4)", () => {
    const changes = levelChanges(LEVELS, "2026-11-02", SEMI);
    expect(
      changes.map((c) => [
        c.date,
        c.source,
        clock(c.predictedMin),
        Math.round(c.easyTo),
        c.easyFrom && Math.round(c.easyFrom),
      ]),
    ).toEqual([
      ["2026-11-01", "effort:a1", "1:50:54", 351, undefined],
      ["2026-11-12", "proposal:RC3", "1:48:35", 344, 351],
    ]);
    expect(levelChanges(LEVELS.slice(2), "2026-11-02", SEMI).map((c) => c.easyFrom)).toEqual([undefined]);
  });
});
