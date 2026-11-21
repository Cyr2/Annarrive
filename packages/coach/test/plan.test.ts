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
  startingVolume,
  totalWeeks,
  volumeCurve,
  weekTemplate,
} from "../src/index.ts";
import { P40 } from "./fixtures.ts";
import { marathonReturn } from "./marathon-return.ts";

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

  it("gives a regular runner two weeks of base, never more than the usual share (P-36)", () => {
    expect(phaseSplit(SEMI, 19, false, true)).toEqual({ base: 2, dev: 9, spe: 6, taper: 2, short: false });
    expect(phaseSplit({ distanceM: 5000 }, 4, false, true)).toEqual({ base: 1, dev: 0, spe: 2, taper: 1, short: true });
    expect(phaseSplit(SEMI, 17, true, true)).toEqual({ base: 10, dev: 0, spe: 5, taper: 2, short: false });
  });

  it("calls regular 3 runs a week over the 8 weeks before, or before a recent race (P-37)", () => {
    expect(startingVolume(runs(8, 4, 45), regular, NOW).regular).toBe(true);
    expect(startingVolume(runs(8, 2, 75), regular, NOW).regular).toBe(false);
    expect(startingVolume(runs(4, 3, 50, "2026-10-05"), regular, NOW).regular).toBe(false);
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
  it("uses 2:1 from 40 years old (P-7) or after an injury, else 3:1", () => {
    expect(cycleFor({ ...regular, age: 42 })).toBe("2:1");
    expect(cycleFor({ ...regular, recentInjury: true })).toBe("2:1");
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

  it("keeps the long run she already runs in a load week, up to Lmax (P14, P-33)", () => {
    expect(longRunMin(4, 130, 21097.5, 62, true)).toBe(62);
    expect(longRunMin(4, 130, 21097.5, 62)).toBeCloseTo(45.5, 6);
    expect(longRunMin(4, 130, 21097.5, 150, true)).toBe(120);
    expect(longRunMin(4, 130, 21097.5, Number.POSITIVE_INFINITY, true)).toBeCloseTo(45.5, 6);
  });

  it("follows its share after a race, from what the race left of her longest run, not her short footings (P-39)", () => {
    expect(longRunMin(4, 190, 21097.5, 50, true)).toBeCloseTo(55, 6);
    expect(longRunMin(4, 190, 21097.5, 50, true, 123)).toBeCloseTo(66.5, 6);
    expect(longRunMin(4, 400, 21097.5, 50, true, 123)).toBe(120);
  });
});

describe("weekTemplate (P11 to P13)", () => {
  it("gives a base week of 4 runs without Q (P-14)", () => {
    const t = weekTemplate("base", 4, 21097.5, 0);
    expect(t).toEqual(["E+strides", "E", "E+sprints", "L"]);
  });

  it("closes the base with a fartlek, alternates I with T then CRUISE in development, strides in one E (P-34)", () => {
    expect(weekTemplate("base", 3, 10000, 4, true)).toEqual(["FARTLEK", "E+strides", "L"]);
    expect(weekTemplate("base", 5, 10000, 0)).toEqual(["E+strides", "E", "E+sprints", "RECUP", "L"]);
    expect(weekTemplate("dev", 4, 21097.5, 0)).toEqual(["I", "E+strides", "T", "L"]);
    expect(weekTemplate("dev", 5, 21097.5, 1)).toEqual(["CRUISE", "E+strides", "I", "RECUP", "L"]);
  });

  it("puts the specific quality first in the specific phase, a short I in the half's deload (P-35)", () => {
    expect(weekTemplate("spe", 3, 21097.5, 0)).toEqual(["SPE", "E+strides", "L"]);
    expect(weekTemplate("spe", 4, 21097.5, 0)).toEqual(["SPE", "E+strides", "T", "L"]);
    expect(weekTemplate("spe", 4, 21097.5, 1)).toEqual(["SPE", "E+strides", "CRUISE", "L"]);
    expect(weekTemplate("spe", 4, 21097.5, 3, false, true)).toEqual(["SPE", "E+strides", "I", "L"]);
    expect(weekTemplate("spe", 4, 42195, 3, false, true)).toEqual(["SPE", "E+strides", "CRUISE", "L"]);
    expect(weekTemplate("spe", 4, 5000, 0)).toEqual(["I", "E+strides", "T", "L"]);
    expect(weekTemplate("taper", 4, 10000, 1)).toEqual(["CRUISE", "E+strides", "I", "L"]);
  });
});

describe("two hard runs a week at most (P11, P-40)", () => {
  const hardSlots = ["T", "CRUISE", "I", "R", "SPE", "FARTLEK", "TEST"];
  const plan = generatePlan(SEMI, regular, runs(8, 4, 45), { vdot: 40 }, NOW);
  const spe = plan.weeks.filter((w) => w.phase === "spe");

  it("drops SPE for an easy run with strides when the long run carries the race-pace block, keeps the threshold", () => {
    const block = spe.filter((w) => !w.deload && w.progressionStep % 2 === 0);
    expect(block.length).toBeGreaterThan(0);
    for (const w of block) {
      expect(w.template).toEqual(["E+strides", "E+strides", w.template[2], "L"]);
      expect(["T", "CRUISE"]).toContain(w.template[2]);
    }
    const other = spe.find((w) => !w.deload && w.progressionStep % 2 === 1);
    expect(other?.template[0]).toBe("SPE");
  });

  it("never builds three hard runs, a long run with a race-pace block counted", () => {
    for (const w of plan.weeks) {
      const s = buildWeek(w, { paces: P40, distM: 21097.5, longest30dMin: 200, racePaceSKm: 313 });
      const longBlock = s.some((x) => x.type === "L" && x.steps.some((st) => st.zone === "race"));
      expect(w.template.filter((t) => hardSlots.includes(t)).length + Number(longBlock)).toBeLessThanOrEqual(2);
    }
  });

  it("keeps two Q when a 3-run week's long run has no room for a third", () => {
    const three = generatePlan(SEMI, { ...regular, runsPerWeek: 3 }, runs(8, 3, 60), { vdot: 40 }, NOW);
    expect(three.weeks.filter((w) => w.phase === "spe" && !w.deload).every((w) => w.template[0] === "SPE")).toBe(true);
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

  it("halves the volume after a stop of 28 days or more", () => {
    const old = runs(4, 3, 50, "2026-10-05");
    expect(startingVolume(old, regular, NOW).v0).toBe(75);
  });

  // Audit of 21/11/2026: 4 runs a week up to a marathon on 25/10, then 2 to 3 easy runs a week.
  const back = marathonReturn().filter((a) => a.start < "2026-11-21");
  const week = (from: string): number =>
    back.filter((a) => a.start >= from && a.start < addDays(from, 7)).reduce((s, a) => s + a.durMin, 0);

  it("reads her frequency on the 4 weeks before a race of the last 8 weeks, never the race as volume (P-29)", () => {
    const start = startingVolume(back, regular, "2026-11-21");
    expect(start.runsPerWeek).toBeGreaterThanOrEqual(3);
    expect(start.regular).toBe(true);
    const recent = ["2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map(week);
    // The marathon week counts only its training runs; V0 is her best week since, at most 80 % of her usual volume.
    expect(recent[0]).toBeGreaterThan(300);
    expect(start.v0).toBeCloseTo(Math.max(...recent.slice(1)), 6);
    expect(start.v0).toBeLessThan(150);
  });

  it("keeps development weeks after a marathon and starts the curve from what she runs (P-30)", () => {
    const plan = generatePlan(
      { ...SEMI, date: "2027-04-04", targetMin: 108 },
      regular,
      back,
      { vdot: 39 },
      "2026-11-21",
    );
    // P6: 4 runs a week in the 8 weeks before the marathon: a regular runner, two weeks of base.
    expect(plan.split).toMatchObject({ base: 2, dev: 9, spe: 6, taper: 2 });
    expect(plan.weeks[1]?.template[0]).toBe("FARTLEK");
    expect(plan.weeks[0]?.volumeMin).toBeLessThanOrEqual(1.1 * week("2026-11-09") + 1);
    expect(plan.weeks.some((w) => w.template.includes("I"))).toBe(true);
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

  it("lets the peak reach a big block of 8 months ago, now that the Garmin history goes back a year (P8)", () => {
    const recent = runs(8, 4, 45);
    const spring = runs(4, 3, 110, "2026-03-16").map((a) => ({ ...a, id: `spring-${a.id}` }));
    const peak = (history: Activity[]) =>
      Math.max(
        ...generatePlan({ distanceM: 42195, date: "2027-06-20" }, regular, history, { vdot: 40 }, NOW).weeks.map(
          (w) => w.volumeMin,
        ),
      );
    expect(peak(recent)).toBeLessThanOrEqual(1.2 * 180);
    expect(peak([...spring, ...recent])).toBeGreaterThan(1.2 * 180);
    expect(peak([...spring, ...recent])).toBeLessThanOrEqual(1.2 * 330);
  });

  it("runs the last long run at D-14 for a half and D-21 for a marathon (P18, P-31)", () => {
    const longs = (p: typeof plan) => p.weeks.map((w) => w.template.includes("L"));
    expect(longs(plan).slice(-3)).toEqual([true, false, true]);
    const marathon = generatePlan({ distanceM: 42195, date: "2027-04-18" }, regular, runs(8, 4, 60), { vdot: 40 }, NOW);
    expect(longs(marathon).slice(-4)).toEqual([true, false, false, true]);
    expect(plan.weeks.at(-2)?.template.filter((s) => s === "E" || s === "E+strides")).toHaveLength(2);
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

describe("buildWeek", () => {
  const plan = generatePlan(SEMI, regular, runs(8, 4, 45), { vdot: 40 }, NOW);
  const ctx = { paces: P40, distM: 21097.5, longest30dMin: 90 } as const;

  it("sizes a base week with the long run first in priority and no Q", () => {
    const w = plan.weeks[0];
    if (!w) throw new Error("no week");
    const s = buildWeek(w, ctx);
    expect(s.map((x) => x.type)).toEqual(["E", "E", "E", "L"]);
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

  it("keeps a deload's long run at its share of the week, not cut twice (P9, P-23)", () => {
    const deload = plan.weeks.find((w) => w.phase === "dev" && w.deload);
    if (!deload) throw new Error("no deload");
    const l = buildWeek(deload, { ...ctx, longest30dMin: 200 }).find((x) => x.type === "L");
    expect(l?.durMin).toBe(Math.floor(0.35 * deload.volumeMin));
  });

  it("never builds a deload week above its volume, race-pace blocks included (P9, P-28)", () => {
    // Bench, Anna week 8: a specific-phase deload planned at 149 min was built at 184 by a race-pace block.
    for (const w of plan.weeks.filter((x) => x.deload)) {
      const total = buildWeek(w, { ...ctx, racePaceSKm: 313 }).reduce((sum, s) => sum + s.durMin, 0);
      expect(total).toBeLessThanOrEqual(w.volumeMin + 1);
    }
  });

  it("never builds a taper week above its share of the peak, Q included (P18, P-24)", () => {
    const w = plan.weeks.at(-2);
    if (!w) throw new Error("no taper");
    const total = buildWeek(w, ctx).reduce((sum, s) => sum + s.durMin, 0);
    expect(total).toBeLessThanOrEqual(w.volumeMin + 1);
  });

  it("keeps a test whole whatever the week, and an E between 30 and 75 min (F10, P15)", () => {
    const w = plan.weeks[1];
    if (!w) throw new Error("no week");
    const s = buildWeek({ ...w, deload: true, template: ["TEST", "E", "E", "L"], volumeMin: 400 }, ctx);
    expect(s[0]?.steps.find((st) => st.kind === "work")?.durMin).toBe(20);
    expect(s.filter((x) => x.type === "E").every((x) => x.durMin >= 30 && x.durMin <= 75)).toBe(true);
  });

  it("keeps every footing under 3/4 of the long run, past it only for her usual footing (P15, P-41)", () => {
    const dev = plan.weeks.find((w) => w.phase === "dev" && !w.deload);
    if (!dev) throw new Error("no dev week");
    const big = { ...dev, volumeMin: 300 };
    const s = buildWeek(big, { ...ctx, spikeRefMin: 200 });
    const l = s.find((x) => x.type === "L")?.durMin ?? 0;
    expect(l).toBeCloseTo(0.35 * 300, 0);
    expect(s.filter((x) => x.type === "E").every((x) => x.durMin <= 0.75 * l + 0.5)).toBe(true);
    // A long run G1 holds at 49.5 min: the footings keep her 45 min, under the long run.
    const base = plan.weeks[0];
    if (!base) throw new Error("no week");
    const held = (usualRunMin: number) =>
      buildWeek({ ...base, volumeMin: 190 }, { ...ctx, longest30dMin: 45, usualRunMin }).filter((x) => x.type !== "L");
    expect(held(45).map((x) => Math.round(x.durMin))).toEqual([45, 45, 45]);
    expect(held(0).map((x) => Math.round(x.durMin))).toEqual([37, 37, 37]);
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
