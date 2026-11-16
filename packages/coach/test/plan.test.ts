import { describe, expect, it } from "vitest";
import type { Activity, Profile } from "../src/index.ts";
import {
  addDays,
  buildWeek,
  cycleFor,
  feasibility,
  generatePlan,
  isHard,
  longRunMin,
  peakVolume,
  phaseSplit,
  replanFromActual,
  startingVolume,
  totalWeeks,
  volumeCurve,
  weekTemplate,
} from "../src/index.ts";
import { P40 } from "./fixtures.ts";

const NOW = "2026-11-16T09:00";
const SEMI = { distanceM: 21097.5, date: "2027-03-21" } as const;
const regular: Profile = { level: "regular", runsPerWeek: 4 };
const runs = (weeks: number, perWeek: number, durMin: number, from = "2026-11-09"): Activity[] =>
  [...Array(weeks * perWeek).keys()].map((i) => ({
    id: `a${i}`,
    start: `${addDays(from, -7 * Math.floor(i / perWeek) + (i % perWeek) * 2)}T08:00`,
    durMin,
    distM: durMin * 160,
  }));

describe("phaseSplit (P3 to P7)", () => {
  it("splits a half marathon of 17 weeks into 5, 5, 5 and 2 (P-1)", () => {
    expect(totalWeeks(NOW, SEMI.date)).toBe(17);
    expect(phaseSplit(SEMI, 17, false)).toEqual({ base: 5, dev: 5, spe: 5, taper: 2, short: false });
  });

  it("squeezes a 4-week 5 km plan and flags it short (P-2)", () => {
    expect(phaseSplit({ distanceM: 5000 }, 4, false)).toEqual({ base: 1, dev: 0, spe: 2, taper: 1, short: true });
  });

  it("uses a 2-week taper for a marathon under 16 weeks (P-3)", () => {
    expect(phaseSplit({ distanceM: 42195 }, 14, false)).toEqual({ base: 4, dev: 4, spe: 4, taper: 2, short: false });
  });

  it("moves development weeks to base when the base is low (P-4)", () => {
    expect(phaseSplit(SEMI, 17, true)).toEqual({ base: 10, dev: 0, spe: 5, taper: 2, short: false });
  });
});

describe("peakVolume (P8)", () => {
  it("takes the smallest of target, growth and 1.2 × the 12-month max (P-5)", () => {
    expect(peakVolume(21097.5, 150, 8, 200)).toEqual({ vPeak: 240 });
  });

  it("warns when the peak stays under the minimum (P-6)", () => {
    const r = peakVolume(42195, 90, 6, 150);
    expect(r.vPeak).toBeCloseTo(159.4, 1);
    expect(r.warning).toBe("peak_below_min");
  });
});

describe("cycleFor (P9)", () => {
  it("uses 2:1 from 40 years old (P-7), after an injury or a tired week, else 3:1", () => {
    expect(cycleFor({ ...regular, age: 42 })).toBe("2:1");
    expect(cycleFor({ ...regular, recentInjury: true })).toBe("2:1");
    expect(cycleFor({ ...regular, fatigueDaysLastWeek: 3 })).toBe("2:1");
    expect(cycleFor({ ...regular, age: 25 })).toBe("3:1");
  });
});

describe("volumeCurve (P10, P18)", () => {
  it("grows 10 % a week and deloads to 75 % in week 4 (P-8)", () => {
    const v = volumeCurve({ base: 5, dev: 5, spe: 5, taper: 2, short: false }, 150, 240, "3:1", 21097.5);
    // Spec rounds to 199.7 and 149.7; exact values are 199.65 and 149.7375.
    expect(v.slice(0, 4).map((x) => Math.round(x * 1e4) / 1e4)).toEqual([165, 181.5, 199.65, 149.7375]);
    expect(v.slice(-2)).toEqual([0.7 * 240, 0.5 * 240]);
    expect(v[11]).toBe(0.75 * 240);
    expect(v[12]).toBe(240);
  });

  it("tapers by distance", () => {
    const split = { base: 4, dev: 4, spe: 5, taper: 1, short: false };
    expect(volumeCurve(split, 150, 240, "3:1", 10000).slice(-2)).toEqual([0.7 * 240, 0.5 * 240]);
    expect(volumeCurve({ ...split, base: 2 }, 150, 240, "3:1", 10000).at(-2)).not.toBe(0.7 * 240);
    expect(volumeCurve(split, 150, 240, "3:1", 5000).at(-1)).toBe(120);
    expect(volumeCurve({ ...split, taper: 2 }, 150, 240, "2:1", 42195).slice(-3)).toEqual([
      0.8 * 240,
      0.62 * 240,
      0.45 * 240,
    ]);
  });
});

describe("longRunMin (P14)", () => {
  it("takes min(40 % of V, Lmax, 1.10 × the longest of 30 days) (P-9)", () => {
    expect(longRunMin(3, 200, 21097.5, 80)).toBe(80);
    expect(longRunMin(5, 400, 42195, 300)).toBe(120);
    expect(longRunMin(3, 600, 42195, 300)).toBe(180);
  });
});

describe("weekTemplate (P11 to P13)", () => {
  it("gives a base week of 4 runs without Q (P-14)", () => {
    const t = weekTemplate("base", 4, 21097.5, 0);
    expect(t).toEqual(["E+strides", "E", "E+COTES_C", "L"]);
  });

  it("closes the base with a fartlek and alternates I and T in development", () => {
    expect(weekTemplate("base", 3, 10000, 4, true)).toEqual(["FARTLEK", "E+strides", "L"]);
    expect(weekTemplate("base", 5, 10000, 0)).toEqual(["E+strides", "E", "E+COTES_C", "RECUP", "L"]);
    expect(weekTemplate("dev", 4, 21097.5, 0)).toEqual(["I", "E", "T", "L"]);
    expect(weekTemplate("dev", 5, 21097.5, 1)).toEqual(["T", "E", "I", "RECUP", "L"]);
  });

  it("puts the specific quality first in the specific phase", () => {
    expect(weekTemplate("spe", 3, 21097.5, 0)).toEqual(["SPE", "E+strides", "L"]);
    expect(weekTemplate("spe", 4, 5000, 0)).toEqual(["I", "E", "T", "L"]);
    expect(weekTemplate("taper", 4, 10000, 1)).toEqual(["T", "E", "I", "L"]);
  });
});

describe("feasibility (P19, P20)", () => {
  it("classes 1:45 from 1:50 in 15 weeks as realistic (P-10)", () => {
    const f = feasibility(110, 105, 15, regular);
    expect(f.gain).toBeCloseTo(0.0455, 4);
    expect(f.gainMax).toBeCloseTo(0.0525, 4);
    expect(f.class).toBe("réaliste");
    expect(f).not.toHaveProperty("proposedMin");
  });

  it("classes 1:40 as unrealistic and proposes no time (P-11)", () => {
    const f = feasibility(110, 100, 15, regular);
    expect(f.gain).toBeCloseTo(0.0909, 4);
    expect(f.class).toBe("irréaliste");
    expect(f).not.toHaveProperty("proposedMin");
  });

  it("classes 1:48 as conservative (P-12)", () => {
    expect(feasibility(110, 108, 15, regular).class).toBe("conservateur");
  });

  it("has no class but 'sans-cible' without a target (P-13)", () => {
    expect(feasibility(110, undefined, 30, regular)).toMatchObject({ class: "sans-cible", gainMax: 0.07 });
  });

  it("classes ambitious targets and marks a provisional VDOT as uncertain", () => {
    expect(feasibility(110, 103, 15, { ...regular, provisional: true })).toMatchObject({
      class: "ambitieux",
      uncertain: true,
    });
    expect(feasibility(110, 103, 15, { ...regular, level: "returning" }).class).toBe("réaliste");
    expect(feasibility(110, 107, 15, { ...regular, level: "advanced" }).class).toBe("ambitieux");
  });
});

describe("startingVolume (P2)", () => {
  it("averages the last four complete weeks", () => {
    expect(startingVolume(runs(4, 3, 50), regular, NOW)).toMatchObject({ v0: 150, provisional: false, runsPerWeek: 3 });
  });

  it("falls back to min(declared, 150) with less than two weeks of data", () => {
    expect(startingVolume([], { ...regular, declaredWeeklyMin: 200 }, NOW)).toMatchObject({
      v0: 150,
      provisional: true,
    });
    expect(startingVolume([], { ...regular, declaredWeeklyMin: 100 }, NOW).v0).toBe(100);
  });

  it("halves the volume after a stop of 28 days or more, and skips sick weeks", () => {
    const old = runs(4, 3, 50, "2026-10-05");
    expect(startingVolume(old, regular, NOW).v0).toBe(75);
    const sick = startingVolume(runs(4, 3, 50), { ...regular, sickWeeks: ["2026-11-09"] }, NOW);
    expect(sick.v0).toBe(150);
  });
});

describe("generatePlan (M2)", () => {
  const plan = generatePlan({ ...SEMI, targetMin: 105 }, regular, runs(8, 4, 45), { vdot: 40.38 }, NOW);

  it("starts next Monday and covers every week up to the race", () => {
    expect(plan.weeks).toHaveLength(17);
    expect(plan.weeks[0]?.monday).toBe("2026-11-23");
    expect(plan.weeks.at(-1)?.monday).toBe("2027-03-15");
    expect(plan.weeks.map((w) => w.phase).slice(0, 2)).toEqual(["base", "base"]);
    expect(plan.weeks.at(-1)?.phase).toBe("taper");
  });

  it("classes the target from the current VDOT", () => {
    expect(plan.feasibility.class).toBe("réaliste");
    expect(plan.v0).toBe(180);
  });

  it("warns about a short plan and a low peak", () => {
    const short = generatePlan(
      { distanceM: 42195, date: "2027-01-31" },
      regular,
      [],
      { vdot: 40, provisional: true },
      NOW,
    );
    expect(short.warnings.map((w) => w.ruleId)).toEqual(["P5", "P8"]);
    expect(short.provisional).toBe(true);
    expect(short.feasibility).toMatchObject({ class: "sans-cible", uncertain: true });
  });
});

describe("replanFromActual (P22)", () => {
  const plan = generatePlan(SEMI, regular, runs(8, 4, 45), { vdot: 40 }, NOW);
  const planned = plan.weeks.map((w) => w.volumeMin);

  it("stops the rise after two weeks under 80 % (P-16)", () => {
    const r = replanFromActual(plan, [0.7 * (planned[0] ?? 0), 0.75 * (planned[1] ?? 0)]);
    expect(r.weeks[2]?.volumeMin).toBe(planned[1]);
    expect(r.weeks[3]?.volumeMin).toBe(planned[2]);
    expect(r.weeks.at(-1)?.volumeMin).toBe(planned.at(-1));
  });

  it("changes nothing when the plan was followed", () => {
    expect(replanFromActual(plan, [planned[0] ?? 0, planned[1] ?? 0])).toBe(plan);
  });
});

describe("buildWeek", () => {
  const plan = generatePlan(SEMI, regular, runs(8, 4, 45), { vdot: 40 }, NOW);
  const ctx = { paces: P40, distM: 21097.5, longest30dMin: 90 } as const;

  it("sizes a base week with the long run first in priority and no Q", () => {
    const w = plan.weeks[0];
    if (!w) throw new Error("no week");
    const s = buildWeek(w, ctx);
    expect(s.map((x) => x.type)).toEqual(["E", "E", "COTES_C", "L"]);
    expect(s.filter((x) => isHard(x) && x.type !== "L")).toEqual([]);
    expect(s.find((x) => x.type === "L")?.priority).toBe(1);
    expect(s.map((x) => x.id)).toEqual(["2026-11-23-0", "2026-11-23-1", "2026-11-23-2", "2026-11-23-3"]);
  });

  it("gives two Q in development, Q1 before Q2, and shrinks a deload week", () => {
    const dev = plan.weeks.find((w) => w.phase === "dev" && !w.deload);
    const deload = plan.weeks.find((w) => w.phase === "dev" && w.deload);
    if (!dev || !deload) throw new Error("missing weeks");
    const s = buildWeek(dev, ctx);
    expect(s.filter((x) => isHard(x) && x.type !== "L").map((x) => x.priority)).toEqual([2, 3]);
    const light = buildWeek(deload, { ...ctx, racePaceSKm: 330 });
    expect(light.find((x) => x.type === "L")?.durMin).toBeLessThan(s.find((x) => x.type === "L")?.durMin ?? 0);
  });

  it("puts Q1 before the long run for a 10 km", () => {
    const ten = generatePlan({ distanceM: 10000, date: "2027-03-21" }, regular, runs(8, 4, 45), { vdot: 40 }, NOW);
    const w = ten.weeks.find((x) => x.phase === "taper");
    if (!w) throw new Error("no taper");
    const s = buildWeek(w, { ...ctx, distM: 10000 });
    expect(s[0]?.priority).toBe(1);
    expect(s.find((x) => x.type === "L")?.priority).toBe(2);
  });
});
