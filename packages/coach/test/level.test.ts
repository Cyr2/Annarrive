import { describe, expect, it } from "vitest";
import type { Activity, Lap } from "../src/index.ts";
import { paces, racePredictions, thresholdHr, thresholdLapsHr } from "../src/index.ts";

const clock = (min: number | undefined): string | undefined => {
  if (min === undefined) return undefined;
  const s = Math.round(min * 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
};
const times = (v: number, avgWeeklyMin: number, longestRunMin: number) =>
  racePredictions(v, { avgWeeklyMin, longestRunMin }).map(
    (p) => `${clock(p.min) ?? "-"}${p.bestCase ? " au mieux" : ""}`,
  );

describe("racePredictions (NV1, NV2)", () => {
  it.each([
    // NV-1: Daniels for 5 km, 10 km and the half; marathon on full volume and long runs.
    [40, 260, 120, ["0:24:06", "0:50:01", "1:50:54", "3:49:37"]],
    // NV-2: enough volume but no run of 1 h 45: the slower of Daniels and Riegel from her half.
    [40, 260, 90, ["0:24:06", "0:50:01", "1:50:54", "3:52:49 au mieux"]],
    // NV-3: some volume (150 to 240 min): best case too.
    [40, 180, 120, ["0:24:06", "0:50:01", "1:50:54", "3:52:49 au mieux"]],
    // NV-4: under 150 min a week, or no run of 1 h 15: no marathon time.
    [40, 140, 120, ["0:24:06", "0:50:01", "1:50:54", "-"]],
    [40, 200, 70, ["0:24:06", "0:50:01", "1:50:54", "-"]],
  ])("VDOT %d, %d min a week, longest run %d min", (v, week, long, expected) => {
    expect(times(v, week, long)).toEqual(expected);
  });
});

const T40 = paces(40).T;
/** 1 km laps at T pace (or `pace` s/km) with the heart rates given. */
const laps = (hrs: (number | undefined)[], pace = T40): Lap[] =>
  hrs.map((avgHr) => ({ durMin: pace / 60, distM: 1000, ...(avgHr === undefined ? {} : { avgHr }) }));
const run = (id: string, start: string, l: Lap[], extra: Partial<Activity> = {}): Activity => ({
  id,
  start,
  distM: l.reduce((s, x) => s + x.distM, 0),
  durMin: l.reduce((s, x) => s + x.durMin, 0),
  laps: l,
  ...extra,
});
const NOW = "2026-11-21T08:00";
const easy = laps([140, 142], T40 + 60);
/** 4 km at T pace (about 20 min): the first lap is the warm-up minutes, the next three are read. */
const tempo = (hr: number) => [...easy, ...laps([hr - 10, hr, hr, hr]), ...easy];
const series = (n: number, value: number) => Array.from({ length: n }, () => value);

describe("thresholdLapsHr (NV3)", () => {
  it.each([
    ["4 laps at T: the 3 after 5 min", tempo(172), 172],
    ["2 laps at T: under 15 min", [...easy, ...laps([165, 172])], undefined],
    ["4 laps 5 % slower than T", laps([160, 170, 170, 170], T40 * 1.05), undefined],
    ["a lap without heart rate breaks the stretch", laps([165, 172, undefined, 172, 172]), undefined],
  ])("%s", (_, l, expected) => {
    expect(thresholdLapsHr(run("a", NOW, l), T40)).toBe(expected);
  });
});

describe("thresholdHr (NV3)", () => {
  const test30 = run("t", "2026-11-10T07:00", [], { durMin: 30, distM: 6000, isTest: true, hrSeries: series(30, 175) });
  const race60 = run("r", "2026-11-14T07:00", [], {
    durMin: 60,
    distM: 11000,
    isRace: true,
    hrSeries: series(60, 178),
  });
  it.each([
    [
      "the latest test or race of 8 weeks first (F14)",
      [test30, race60, run("a", "2026-11-18T18:00", tempo(170))],
      { bpm: 178, from: "race", date: "2026-11-14" },
    ],
    ["a 30 min test", [test30], { bpm: 175, from: "test", date: "2026-11-10" }],
    [
      "two runs with laps at T: their mean",
      [run("a", "2026-11-06T18:00", tempo(170)), run("b", "2026-11-13T18:00", tempo(174))],
      { bpm: 172, from: "laps", date: "2026-11-13" },
    ],
    ["one run with laps at T is not enough", [run("a", "2026-11-13T18:00", tempo(174))], undefined],
    [
      "older than 8 weeks",
      [
        { ...test30, start: "2026-09-20T07:00" },
        run("a", "2026-09-21T18:00", tempo(170)),
        run("b", "2026-09-22T18:00", tempo(170)),
      ],
      undefined,
    ],
    ["nothing measured: unknown, never a share of HRmax", [run("e", "2026-11-18T18:00", easy)], undefined],
  ])("%s", (_, activities, expected) => {
    expect(thresholdHr(activities, T40, NOW)).toEqual(expected);
  });
});
