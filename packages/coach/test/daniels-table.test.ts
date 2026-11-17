import { describe, expect, it } from "vitest";
import { paces, vdot } from "../src/index.ts";

// Daniels' Running Formula, 3rd ed., tables 5.1 and 5.2, as transcribed in two independent copies
// (SD Track Mag "Daniels One Sheet" and the runvdot repo) that agree on every row kept here.
// See research/01-forme-et-allures.md, section 2.1.
const s = (mmss: string): number => {
  const [m = 0, sec = 0] = mmss.split(":").map(Number);
  return m * 60 + sec;
};

// VDOT, E (3rd ed. gives one value), M, T, I per km, R per 400 m.
const TRAINING: [number, string, string, string, string, number][] = [
  [30, "7:40", "6:51", "6:24", "5:55", 136],
  [32, "7:18", "6:31", "6:05", "5:35", 128],
  [36, "6:40", "5:56", "5:33", "5:07", 115],
  [38, "6:23", "5:41", "5:19", "4:54", 110],
  [40, "6:08", "5:27", "5:06", "4:42", 106],
  [42, "5:55", "5:14", "4:54", "4:31", 102],
  [44, "5:41", "5:02", "4:43", "4:21", 98],
  [46, "5:30", "4:51", "4:33", "4:12", 94],
  [50, "5:08", "4:31", "4:15", "3:55", 87],
  [60, "4:26", "3:52", "3:40", "3:23", 75],
  [70, "3:55", "3:24", "3:14", "2:59", 65],
  [85, "3:20", "2:52", "2:46", "2:33", 55],
];

// Spec tolerance (algo.md Q2): 3 s/km. R is printed per 400 m to the second, so its half-step (1.25 s/km) is added.
const TOL = 3;
const TOL_R = TOL + 1.25;

describe("paces against Daniels' table 5.2 (F7, issue #17)", () => {
  it.each(TRAINING)("VDOT %i", (v, e, m, t, i, r400) => {
    const p = paces(v);
    expect(p.E[0]).toBeLessThanOrEqual(s(e));
    expect(p.E[1]).toBeGreaterThanOrEqual(s(e));
    expect(Math.abs(p.M - s(m))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(p.T - s(t))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(p.I - s(i))).toBeLessThanOrEqual(TOL);
    expect(Math.abs(p.R - r400 * 2.5)).toBeLessThanOrEqual(TOL_R);
  });
});

// Anna's range: 10 km in 48 to 60 min, half marathon in 1:45 to 2:05. Table 5.1, VDOT 32 to 44.
const RACES: [number, string, string][] = [
  [32, "60:26", "2:13:49"],
  [34, "57:26", "2:07:16"],
  [36, "54:44", "2:01:19"],
  [38, "52:17", "1:55:55"],
  [40, "50:03", "1:50:57"],
  [42, "48:01", "1:46:27"],
  [44, "46:09", "1:42:17"],
];
const hms = (x: string): number => x.split(":").reduce((acc, n) => acc * 60 + Number(n), 0) / 60;

describe("vdot against Daniels' table 5.1 (F3, issue #17)", () => {
  it.each(RACES)("VDOT %i: 10 km in %s, half marathon in %s", (v, tenK, half) => {
    // Table 5.1 sits up to 0.053 VDOT off Daniels' own equations (algo.md, F tests): 0.06 VDOT, about 3 s on 10 km, 6 s on the half.
    expect(Math.abs(vdot(10000, hms(tenK)) - v)).toBeLessThanOrEqual(0.06);
    expect(Math.abs(vdot(21097.5, hms(half)) - v)).toBeLessThanOrEqual(0.06);
  });
});
