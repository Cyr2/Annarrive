import { describe, expect, it } from "vitest";
import type { Activity, RunType } from "../src/index.ts";
import {
  addDays,
  detrainingFactor,
  effortReadings,
  formatPace,
  fractionF,
  hrMax,
  hrPaceModel,
  hrZones,
  initialFitness,
  isEligibleEffort,
  lthrFromEffort,
  observedHrMax,
  paces,
  pilotFor,
  predictTime,
  riegel,
  speedForVo2,
  vdot,
  vo2,
  vo2maxVersusRace,
} from "../src/index.ts";
import { marathonReturn } from "./marathon-return.ts";

describe("vo2maxVersusRace (F19)", () => {
  it("agrees within 5 points of the race's VDOT, else says which way (F-33)", () => {
    const semi = { distM: 21097.5, tMin: 110 };
    expect(vo2maxVersusRace(44, semi)).toBe("agrees");
    expect(vo2maxVersusRace(46, semi)).toBe("above");
    expect(vo2maxVersusRace(34, semi)).toBe("below");
  });
});

const NOW = "2026-11-16T08:00";
const race = (id: string, start: string, v: number, distM = 5000): Activity => ({
  id,
  start,
  distM,
  durMin: predictTime(v, distM),
  isRace: true,
});
const jog = (id: string, start: string): Activity => ({ id, start, durMin: 40, distM: 7000 });
const sec = (min: number): number => min * 60;

// F-1 to F-6: the expected values are the formula values; daniels-table.test.ts checks them against Daniels' tables.
describe("vdot (F1 to F3)", () => {
  it("gives 39.94 for a 24:08 5 km (F-1, Daniels table VDOT 40)", () => {
    expect(vdot(5000, 24 + 8 / 60)).toBeCloseTo(39.94, 1);
  });

  it("gives 40.38 for a 1:50 half marathon, with F(110) = 0.8465 and VO2 = 34.18 (F-2)", () => {
    expect(vdot(21097.5, 110)).toBeCloseTo(40.38, 2);
    expect(fractionF(110)).toBeCloseTo(0.8465, 4);
    expect(vo2(21097.5 / 110)).toBeCloseTo(34.18, 2);
  });

  it("gives 39.97 for a 3:49:45 marathon (F-3, table VDOT 40)", () => {
    expect(vdot(42195, 229.75)).toBeCloseTo(39.97, 1);
  });

  it("gives 49.97 for a 41:21 10 km (F-4, table VDOT 50)", () => {
    expect(vdot(10000, 41.35)).toBeCloseTo(49.97, 1);
  });

  it("gives 30.02 and 59.99 at the VDOT 30 and 60 table points (F-5)", () => {
    expect(vdot(5000, 30 + 40 / 60)).toBeCloseTo(30.02, 1);
    expect(vdot(21097.5, 78.15)).toBeCloseTo(59.99, 1);
  });

  it("keeps the three terms of F (F-9)", () => {
    expect(fractionF(11)).toBeCloseTo(1.0003, 4);
    expect(fractionF(60)).toBeCloseTo(0.888, 3);
  });

  it("inverts VO2 exactly (F4)", () => {
    expect(vo2(speedForVo2(45))).toBeCloseTo(45, 9);
  });
});

describe("predictTime (F5, F6)", () => {
  it("predicts 24:06, 1:31:31 and 2:43:22 within 3 s (F-6; tables 24:08, 1:31:35, 2:43:25)", () => {
    const cases: [number, number, number][] = [
      [40, 5000, 24 * 60 + 6],
      [50, 21097.5, 3600 + 31 * 60 + 31],
      [60, 42195, 2 * 3600 + 43 * 60 + 22],
    ];
    for (const [v, d, want] of cases) expect(Math.abs(sec(predictTime(v, d)) - want)).toBeLessThanOrEqual(3);
  });

  it("keeps the slower of formula and Riegel for a marathon on low volume", () => {
    const ref = { distM: 21097.5, tMin: 110 };
    const formula = predictTime(40.38, 42195);
    const low = predictTime(40.38, 42195, { avgWeeklyMin: 200, ref });
    expect(low).toBeCloseTo(Math.max(formula, riegel(110, 21097.5, 42195)), 6);
    expect(low).toBeGreaterThan(formula);
    expect(predictTime(40.38, 42195, { avgWeeklyMin: 300, ref })).toBe(formula);
  });
});

describe("paces (F7, F8)", () => {
  it("gives the VDOT 40 paces (F-7)", () => {
    const p = paces(40);
    expect(formatPace(p.E)).toBe("6:08");
    expect([p.M, p.T, p.I, p.R].map(formatPace)).toEqual(["5:27", "5:06", "4:41", "4:26"]);
  });

  it("gives the VDOT 50 paces (F-8)", () => {
    const p = paces(50);
    expect(formatPace(p.E)).toBe("5:08");
    expect([p.M, p.T, p.I, p.R].map(formatPace)).toEqual(["4:31", "4:15", "3:55", "3:40"]);
  });

  it("slows T down to critical speed when T is faster (F8)", () => {
    expect(paces(40, 190).T).toBeCloseTo(60_000 / 190, 6);
    expect(paces(40, 260).T).toBe(paces(40).T);
  });
});

describe("isEligibleEffort (F9)", () => {
  const ctx = { hrMax: 190 };

  it("refuses 2.5 min all out (F-10)", () => {
    expect(isEligibleEffort({ id: "a", start: NOW, durMin: 2.5, distM: 900, isTest: true }, ctx)).toEqual({
      ok: false,
      reason: "duration",
    });
  });

  it("reads a marked marathon up to Daniels' slowest, nothing longer (F-11)", () => {
    expect(isEligibleEffort({ id: "a", start: NOW, durMin: 246, distM: 42400, isRace: true }, ctx)).toEqual({
      ok: true,
    });
    for (const a of [
      { durMin: 300, distM: 42195, isRace: true },
      { durMin: 246, distM: 50000, isRace: true },
      { durMin: 246, distM: 42195, avgHr: 185 },
    ])
      expect(isEligibleEffort({ id: "a", start: NOW, ...a }, ctx)).toEqual({ ok: false, reason: "duration" });
  });

  it("refuses a 40 min run at 0.82 HRmax in the second half (F-12)", () => {
    const series = [...Array(20).fill(140), ...Array(20).fill(0.82 * 190)];
    expect(isEligibleEffort({ id: "a", start: NOW, durMin: 40, distM: 8000, hrSeries: series }, ctx)).toEqual({
      ok: false,
      reason: "not_max",
    });
  });

  it("refuses a 10 km race at 24 °C (F-13)", () => {
    expect(isEligibleEffort({ id: "a", start: NOW, durMin: 50, distM: 10000, isRace: true, tempC: 24 }, ctx)).toEqual({
      ok: false,
      reason: "conditions",
    });
  });

  it("refuses a hilly effort and accepts a hard run near LTHR", () => {
    expect(
      isEligibleEffort({ id: "a", start: NOW, durMin: 50, distM: 10000, isRace: true, elevGainM: 150 }, ctx).reason,
    ).toBe("grade");
    expect(
      isEligibleEffort({ id: "a", start: NOW, durMin: 30, distM: 6000, avgHr: 170 }, { hrMax: 200, lthr: 172 }).ok,
    ).toBe(true);
  });
});

describe("detrainingFactor (F11)", () => {
  it("interpolates the table (F-14)", () => {
    const cases: [number, number][] = [
      [3, 1],
      [10, 0.985],
      [14, 0.973],
      [21, 0.95],
      [45, 0.8765],
      [100, 0.8],
    ];
    for (const [days, want] of cases) expect(detrainingFactor(days)).toBeCloseTo(want, 3);
  });

  it("uses 0.986 at 14 days with cross-training 3 times a week", () => {
    expect(detrainingFactor(14, 3)).toBeCloseTo(0.986, 6);
  });
});

describe("initialFitness (F10)", () => {
  it("takes the best eligible effort of the last 6 weeks (F-15)", () => {
    const f = initialFitness(
      { activities: [race("a", "2026-10-26T09:00", 41.2), race("b", "2026-10-12T09:00", 40.1)] },
      NOW,
    );
    expect(f.vdot).toBeCloseTo(41.2, 1);
    expect(f.status).toBe("measured");
  });

  it("detrains an effort 6 to 12 weeks old by the longest break since (F-16)", () => {
    const runs = ["2026-09-28", "2026-10-12", "2026-10-19", "2026-10-26", "2026-11-02", "2026-11-09"].map((d, i) =>
      jog(`j${i}`, `${d}T08:00`),
    );
    const f = initialFitness({ activities: [race("r", "2026-09-21T09:00", 42), ...runs] }, NOW);
    expect(f.vdot).toBeCloseTo(40.87, 1);
    expect(f.status).toBe("measured");
  });

  it("trusts a recent declared time over Garmin VO2max, provisional with a test (F-17, F-24)", () => {
    const f = initialFitness({ activities: [], vo2maxGarmin: 44, declared: { distM: 21097.5, tMin: 110 } }, NOW);
    expect(f.vdot).toBeCloseTo(40.38, 2);
    expect(f).toMatchObject({ status: "provisional", testWeek: [2, 4], source: "declared" });
    const higher = initialFitness(
      { activities: [], vo2maxGarmin: 34, declared: { distM: 21097.5, tMin: 110, date: "2026-09-20" } },
      NOW,
    );
    expect(higher).toMatchObject({ vdot: expect.closeTo(40.38, 2), source: "declared" });
  });

  it("lets a test or race run after her declared time measure her, even lower (F-39)", () => {
    const declared = { distM: 21097.5, tMin: 93 };
    const test: Activity = { ...race("t", "2026-11-10T09:00", 48.4), isRace: undefined, isTest: true };
    expect(initialFitness({ activities: [test], declared }, NOW)).toMatchObject({
      vdot: expect.closeTo(48.4, 1),
      status: "measured",
    });
    const dated = { ...declared, date: "2026-11-12" };
    expect(initialFitness({ activities: [test], declared: dated }, NOW)).toMatchObject({ source: "declared" });
  });

  it("keeps the lower of VO2max and a declared time older than 6 months (F-25)", () => {
    const old = { distM: 21097.5, tMin: 110, date: "2026-01-10" };
    expect(initialFitness({ activities: [], vo2maxGarmin: 34, declared: old }, NOW)).toMatchObject({
      vdot: 34,
      source: "garmin_vo2max",
    });
  });

  it("never goes below what a recent run proves (F-26)", () => {
    const run: Activity = { id: "f", start: "2026-11-10T08:00", durMin: 50, distM: 10000, avgHr: 150 };
    const f = initialFitness({ activities: [run], vo2maxGarmin: 34, hr: { hrMax: 195 } }, NOW);
    expect(f).toMatchObject({ vdot: expect.closeTo(40, 0), status: "provisional", source: "floor:f" });
    expect(() => initialFitness({ activities: [run], hr: { hrMax: 195 } }, NOW)).toThrow("NO_FITNESS_DATA");
  });

  it("throws NO_FITNESS_DATA when nothing is known (F-18)", () => {
    expect(() => initialFitness({ activities: [] }, NOW)).toThrow("NO_FITNESS_DATA");
  });

  it("reads an easy-heavy runner from her few faster laps, not her watch (F-23)", () => {
    const lap = (minPerKm: number, avgHr: number) => ({ durMin: minPerKm, distM: 1000, avgHr });
    const easyRun = (i: number): Activity => ({
      id: `e${i}`,
      start: `${addDays("2026-11-15", -2 * i)}T18:00`,
      durMin: 50,
      distM: 7400,
      avgHr: 150,
      laps: Array.from({ length: 7 }, () => lap(6.75, 150)),
    });
    const tempo = (id: string, day: string): Activity => {
      const laps = [lap(6.67, 140), lap(6.67, 146), ...Array.from({ length: 4 }, () => lap(5.25, 170)), lap(6.8, 150)];
      return {
        id,
        start: `${day}T18:00`,
        durMin: laps.reduce((t, l) => t + l.durMin, 0),
        distM: 7000,
        avgHr: 158,
        laps,
      };
    };
    const activities = [
      ...Array.from({ length: 18 }, (_, i) => easyRun(i)),
      tempo("t1", "2026-11-04"),
      tempo("t2", "2026-11-11"),
    ];
    const f = initialFitness({ activities, vo2maxGarmin: 34, hr: { hrMax: 192 } }, NOW);
    expect(f.status).toBe("measured");
    const t = paces(f.vdot).T;
    expect(t).toBeGreaterThanOrEqual(310);
    expect(t).toBeLessThanOrEqual(320);
    expect(paces(34).T).toBeGreaterThan(340);
  });

  it("reads laps past 92 % of HRmax as a race and leaves GPS glitches out (F-27)", () => {
    const hard: Activity = {
      id: "h",
      start: "2026-11-09T08:00",
      durMin: 30,
      distM: 5000,
      laps: [
        { durMin: 20, distM: 4000, avgHr: 180 },
        { durMin: 0.5, distM: 1000, avgHr: 180 },
      ],
    };
    const [r] = effortReadings({ activities: [hard], hr: { hrMax: 192 } }, NOW);
    expect(r).toMatchObject({ kind: "race", vdot: expect.closeTo(vdot(4000, 20), 2) });
  });

  // The bench's beginner: 5 × 3 min at I pace (93 % HRmax) with 3 min jogs read as a maximal 3 min, VDOT 26.6 for 33.
  const intervals = (plannedType?: Activity["plannedType"]): Activity => ({
    id: "i",
    start: "2026-11-09T08:00",
    durMin: 55,
    distM: 9000,
    ...(plannedType ? { plannedType } : {}),
    laps: [
      { durMin: 15, distM: 2300, avgHr: 135 },
      ...[0, 1, 2, 3, 4].flatMap(() => [
        { durMin: 3, distM: 750, avgHr: 176 },
        { durMin: 3, distM: 450, avgHr: 150 },
      ]),
      { durMin: 10, distM: 1500, avgHr: 140 },
    ],
  });

  it("never reads reps and their recoveries as one effort, nor a 3 min rep as a maximal one (F-28)", () => {
    const readings = effortReadings({ activities: [intervals()], hr: { hrMax: 188 } }, NOW);
    expect(readings.every((r) => r.kind === "training")).toBe(true);
  });

  it("reads no lap window of a planned interval session (F-29)", () => {
    const steady: Activity = {
      ...intervals("CRUISE"),
      laps: [{ durMin: 20, distM: 4000, avgHr: 170 }],
    };
    expect(effortReadings({ activities: [steady], hr: { hrMax: 188 } }, NOW)[0]?.kind).toBe("training");
    expect(effortReadings({ activities: [{ ...steady, plannedType: "T" }], hr: { hrMax: 188 } }, NOW)[0]?.kind).toBe(
      "threshold",
    );
  });

  // Anna's real 12 weeks (level CLI of 2026-11-19): 19 runs, HRmax 187, a half on 27/09, an 11 km tempo on 11/11.
  const annaLap = (min: number, distM: number, avgHr: number) => ({ durMin: min, distM, avgHr });
  const half: Activity = {
    id: "garmin:24514776474",
    start: "2026-09-27T09:00",
    distM: 21270,
    durMin: 112.1,
    avgHr: 166,
  };
  const tempo11: Activity = {
    id: "garmin:25045694091",
    start: "2026-11-11T18:00",
    distM: 11010,
    durMin: 60.62,
    avgHr: 163,
    laps: [
      annaLap(6.4, 1000, 148),
      ...Array.from({ length: 9 }, () => annaLap(5.3, 1000, 168)),
      annaLap(6.52, 1010, 150),
    ],
  };
  const fiveK: Activity = { id: "garmin:5k", start: "2026-10-04T09:00", distM: 5070, durMin: 26.43, avgHr: 160 };
  const easyRuns = Array.from(
    { length: 16 },
    (_, i): Activity => ({
      id: `garmin:e${i}`,
      start: `${addDays("2026-08-30", i * 5)}T18:00`,
      distM: 6000,
      durMin: 40.5,
      avgHr: 145,
    }),
  );
  const anna = { activities: [...easyRuns, half, fiveK, tempo11], hr: { hrMax: 187 } };

  it("reads a run of more than 60 min at T heart rate as a race, not as T pace (F-30)", () => {
    const [reading] = effortReadings({ activities: [half], hr: { hrMax: 187 } }, "2026-11-19T08:00");
    expect(reading).toMatchObject({ kind: "race" });
    expect(reading?.vdot).toBeCloseTo(vdot(21270, 112.1), 6);
  });

  it("takes the higher of her 11 km tempo of last week and her half of 7 weeks ago, detrained (F-31)", () => {
    const halfNow = vdot(21270, 112.1) * detrainingFactor(6);
    const f = initialFitness(anna, "2026-11-19T08:00");
    expect(f).toMatchObject({ status: "measured", source: "effort:garmin:24514776474:detrained" });
    expect(f.vdot).toBeCloseTo(halfNow, 6);
    // Without the half, the tempo: T 5:18, the pace she held.
    const noHalf = initialFitness({ ...anna, activities: [...easyRuns, fiveK, tempo11] }, "2026-11-19T08:00");
    expect(noHalf).toMatchObject({ status: "measured", source: "effort:garmin:25045694091" });
    expect(formatPace(paces(noHalf.vdot).T)).toBe("5:18");
  });

  // Audit of 21/11/2026: 4 weeks after a 4:06 marathon, heart rate drifting to 91 % of 192 over its last 17 km.
  it("reads a marked marathon as a race, never its drifted laps as a threshold (F-34)", () => {
    const h = { activities: marathonReturn(), hr: { hrMax: 192 }, vo2maxGarmin: 45 };
    const marathon = effortReadings(h, "2026-11-21T10:00").find((r) => r.start.startsWith("2026-10-25"));
    expect(marathon?.kind).toBe("race");
    expect(marathon?.vdot).toBeCloseTo(vdot(marathon?.distM ?? 0, marathon?.durMin ?? 1), 6);
    expect(initialFitness(h, "2026-11-21T10:00")).toMatchObject({ vdot: expect.closeTo(38.97, 2), status: "measured" });
  });

  it("keeps her threshold runs of 6 to 12 weeks over a lower marathon of 4 weeks (F-35)", () => {
    const h = { activities: marathonReturn({ lastTempo: false }), hr: { hrMax: 192 }, vo2maxGarmin: 45 };
    const f = initialFitness(h, "2026-11-21T10:00");
    expect(f.status).toBe("measured");
    expect(f.source).toMatch(/:detrained$/);
    expect(f.vdot).toBeGreaterThan(38.5);
  });

  it("reads her real half as the race it was, not as a threshold from its first hour (F-36)", () => {
    // Production, 21/11/2026 (rounded): HRmax 188, the half at 88.8 % then 90 %, laps on every run.
    const laps = [
      ...Array.from({ length: 12 }, () => annaLap(5.067, 1000, 167)),
      ...Array.from({ length: 9 }, () => annaLap(5.517, 1000, 170)),
      annaLap(1.49, 270, 171),
    ];
    const realHalf: Activity = { ...half, durMin: laps.reduce((t, l) => t + l.durMin, 0), avgHr: 168, laps };
    const marathon: Activity = {
      id: "garmin:m",
      start: "2026-10-25T08:30",
      distM: 42430,
      durMin: 252.77,
      avgHr: 160,
      isRace: true,
    };
    const jogs = Array.from(
      { length: 29 },
      (_, i): Activity => ({
        ...jog(`j${i}`, `${addDays("2026-08-25", 3 * i)}T18:00`),
      }),
    );
    const now = "2026-11-21T10:00";
    const h = { activities: [...jogs, realHalf, marathon, tempo11], hr: { hrMax: 188 }, vo2maxGarmin: 53.4 };
    const readings = effortReadings(h, now);
    expect(readings.find((r) => r.activityId === half.id)).toMatchObject({
      kind: "race",
      vdot: expect.closeTo(vdot(realHalf.distM, realHalf.durMin), 6),
    });
    expect(readings.find((r) => r.activityId === "garmin:m")?.kind).toBe("race");
    const f = initialFitness(h, now);
    expect(f).toMatchObject({ status: "measured", source: `effort:${half.id}:detrained` });
    expect(f.vdot).toBeCloseTo(vdot(realHalf.distM, realHalf.durMin), 1);
  });

  it("reads the 51-day 'break' of a first sync that had stored her half and nothing after it (F-32)", () => {
    const partial = { ...anna, activities: [...easyRuns.filter((a) => a.start < half.start), half] };
    const f = initialFitness(partial, "2026-11-17T08:00");
    expect(f).toMatchObject({ source: "effort:garmin:24514776474:detrained" });
    expect(f.vdot).toBeCloseTo(34.2, 1);
  });

  it("counts a hard run as eligible when heart rate proves it", () => {
    const a: Activity = { id: "h", start: "2026-11-09T08:00", durMin: 30, distM: 6500, avgHr: 185 };
    expect(initialFitness({ activities: [a], hr: { hrMax: 195 } }, NOW).source).toBe("effort:h");
  });
});

describe("hrMax and zones (F12, F13)", () => {
  it("keeps an observed max above 0.95 of Tanaka (F-19)", () => {
    expect(hrMax(192, 21)).toEqual({ value: 192, estimated: false });
  });

  it("uses Tanaka when the observed max is too low (F-20)", () => {
    expect(hrMax(175, 21)).toEqual({ value: 193.3, estimated: true });
  });

  it("has no zones without age nor heart rate, and trusts HR alone without age", () => {
    expect(hrMax(undefined, undefined)).toBeNull();
    expect(hrMax(188, undefined)).toEqual({ value: 188, estimated: false });
  });

  it("leaves out a maximum of a footing no other run confirms within 3 bpm (F-37)", () => {
    const footing = (maxHr: number) => ({ maxHr, avgHr: 145 });
    expect(observedHrMax([footing(150), footing(214), footing(190), footing(192)])).toBe(192);
    expect(observedHrMax([footing(189), footing(192), footing(175)])).toBe(192);
    // Her half: 187 at the end of 112 min at 166, far above her footings, is her maximum.
    expect(observedHrMax([footing(170), { maxHr: 187, avgHr: 166 }])).toBe(187);
    expect(observedHrMax([footing(188)])).toBe(188);
    expect(observedHrMax([])).toBeUndefined();
  });

  it("uses Karvonen without LTHR (F-21)", () => {
    expect(hrZones(195, 55)).toEqual({ method: "karvonen", E: [138, 159], T: [173, 178] });
  });

  it("uses Friel bands with a measured LTHR", () => {
    expect(hrZones(195, 55, 170)).toEqual({ method: "friel", E: [145, 151], T: [162, 173] });
  });
});

describe("lthrFromEffort (F14)", () => {
  it("averages minutes 10 to 30 of a 30 min test", () => {
    const series = [...Array(10).fill(150), ...Array(20).fill(175)];
    expect(lthrFromEffort({ id: "t", start: NOW, durMin: 30, distM: 6000, isTest: true, hrSeries: series })).toBe(175);
  });

  it("averages the last 10 minutes of a 50 to 65 min race, and ignores other runs", () => {
    const series = [...Array(50).fill(165), ...Array(10).fill(178)];
    expect(lthrFromEffort({ id: "r", start: NOW, durMin: 60, distM: 12000, isRace: true, hrSeries: series })).toBe(178);
    expect(lthrFromEffort({ id: "x", start: NOW, durMin: 40, distM: 8000, hrSeries: series })).toBeUndefined();
    expect(lthrFromEffort({ id: "y", start: NOW, durMin: 30, distM: 6000, isTest: true })).toBeUndefined();
  });

  it("takes 95 % of the 20 min lap of the app's test (F-38)", () => {
    const laps = [
      { durMin: 10, distM: 1600, avgHr: 140 },
      { durMin: 20, distM: 4400, avgHr: 180 },
      { durMin: 5, distM: 800, avgHr: 150 },
    ];
    expect(lthrFromEffort({ id: "t", start: NOW, durMin: 35, distM: 6800, isTest: true, laps })).toBe(171);
    expect(lthrFromEffort({ id: "e", start: NOW, durMin: 35, distM: 6800, laps })).toBeUndefined();
  });
});

describe("hrPaceModel (F15)", () => {
  const seg = (v: number, hr: number) => ({ startMin: 15, durMin: 6, gradePct: 0, vMpm: v, hr });

  it("needs six stable segments, otherwise keeps the previous model (F-22)", () => {
    expect(hrPaceModel([150, 160, 170, 180, 190].map((v) => seg(v, 60 + 0.5 * v)))).toBeNull();
  });

  it("fits HR = a + b·v and resists one outlier", () => {
    const segs = [150, 160, 170, 180, 190, 200].map((v) => seg(v, 60 + 0.5 * v));
    segs.push({ ...seg(175, 200), startMin: 20 });
    const m = hrPaceModel(segs);
    expect(m?.b).toBeCloseTo(0.5, 6);
    expect(m?.a).toBeCloseTo(60, 6);
  });

  it("drops early, short, steep or hot segments", () => {
    const bad = [
      { ...seg(150, 135), startMin: 5 },
      { ...seg(160, 140), durMin: 3 },
      { ...seg(170, 145), gradePct: 3 },
      { ...seg(180, 150), tempC: 25 },
    ];
    expect(hrPaceModel([...bad, seg(150, 135), seg(160, 140)])).toBeNull();
  });
});

describe("pilotFor (F16)", () => {
  it("pilots easy runs by HR, quality by pace, short efforts by RPE", () => {
    const types: RunType[] = ["E", "L", "T", "I", "R", "FARTLEK"];
    expect(types.map((t) => pilotFor(t))).toEqual(["hr", "hr", "pace", "pace", "rpe", "rpe"]);
  });

  it("only becomes more conservative in heat or wind", () => {
    expect(pilotFor("T", true)).toBe("hr");
  });
});
