import { describe, expect, it } from "vitest";
import { seedProgression } from "../../api/mock/progression.ts";
import {
  bars,
  changeLabel,
  currentWeek,
  keptLine,
  raceDay,
  shortTime,
  summary,
  trajectory,
  weekLine,
  weekRows,
} from "./progression.ts";

const MONDAY = "2026-11-16";
const d = seedProgression(MONDAY, "2027-01-17");
const TODAY = "2026-11-17";

describe("Progression block", () => {
  it("says times as a runner does", () => {
    expect(shortTime(111)).toBe("1:51");
    expect(shortTime(110.6)).toBe("1:51");
    expect(shortTime(24.1)).toBe("24:06");
  });

  it("finds the current week and its minutes", () => {
    expect(currentWeek(d, TODAY)).toBe(3);
    expect(currentWeek(d, "2026-10-01")).toBe(-1);
    expect(weekLine(d, TODAY)).toBe("1 h 48 sur 2 h 54 cette semaine");
  });

  it("counts kept runs, plural only past one", () => {
    expect(keptLine(d)).toEqual({ figure: "11 séances tenues sur 12", rest: "depuis le début du programme" });
    expect(keptLine({ ...d, kept: { kept: 1, total: 2 } })).toEqual({
      figure: "1 séance tenue sur 2",
      rest: "depuis le début du programme",
    });
    expect(keptLine({ ...d, kept: { kept: 0, total: 0 } }).figure).toBe("Pas encore de séance passée");
  });

  it("draws the weeks begun, today last, faster higher, towards the target on race day", () => {
    const t = trajectory(d, TODAY);
    expect(t?.points.map((p) => p.min)).toEqual([113.5, 112.2, 111, 111]);
    expect(t?.points.map((p) => p.x)).toEqual([1 / 12, 2 / 12, 3 / 12, (3 + 2 / 7) / 12]);
    const [first, , , now] = t?.points ?? [];
    expect(now?.y).toBeGreaterThan(first?.y ?? 1);
    expect(t?.target).toMatchObject({ x: 1, min: 108 });
    expect(t?.target?.y).toBeGreaterThan(now?.y ?? 1);
  });

  it("waits for a second week before drawing a curve", () => {
    const early = { ...d, weeks: d.weeks.map((w, i) => (i === 0 ? w : { ...w, estimateMin: undefined })) };
    expect(trajectory(early, "2026-10-27")).toBeNull();
    const noTarget = trajectory({ ...d, targetMin: undefined }, TODAY);
    expect(noTarget?.target).toBeUndefined();
  });

  it("scales the bars on the tallest week", () => {
    const b = bars(d);
    expect(b).toHaveLength(12);
    expect(Math.max(...b.map((x) => x.planned))).toBe(1);
    expect(b[3]?.done).toBeCloseTo(108 / 240);
  });

  it("lists the weeks newest first and names each change", () => {
    expect(weekRows(d, TODAY).map((r) => r.label)).toEqual(["Semaine 4", "Semaine 3", "Semaine 2", "Semaine 1"]);
    expect(weekRows(d, TODAY)[0]?.value).toBe("1:51:00");
    expect(d.changes.map(changeLabel)).toEqual(["Jeudi 12 novembre", "Jeudi 5 novembre", "Départ"]);
    expect(raceDay(d)).toBe("17 janvier");
  });

  it("reads the curve and the bars to VoiceOver", () => {
    expect(summary(d, TODAY)).toBe(
      "Semi estimé : semaine 1, 1:53:30 ; semaine 2, 1:52:12 ; semaine 3, 1:51:00 ; semaine 4, 1:51:00. " +
        "Temps couru sur temps prévu : semaine 1, 2 h 28 sur 2 h 30 ; semaine 2, 2 h 43 sur 2 h 40 ; " +
        "semaine 3, 2 h 38 sur 2 h 55 ; semaine 4, 1 h 48 sur 2 h 54.",
    );
  });
});
