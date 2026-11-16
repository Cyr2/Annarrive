import { describe, expect, it } from "vitest";
import {
  createdWorkoutSchema,
  garminActivitySchema,
  garminDailySignalsSchema,
  garminLapSchema,
  workoutRequestSchema,
} from "../src/index.ts";

const mps = (seconds: number) => 1000 / seconds;

describe("garmin bridge responses", () => {
  it("accept an activity with missing fields", () => {
    const activity = {
      id: 42,
      type: "running",
      startTimeLocal: "2026-11-15 07:30:00",
      startTimeGmt: null,
      durationS: 1800,
      distanceM: 5000,
      avgSpeedMps: 2.5,
      avgPaceSPerKm: 400,
      avgHr: null,
      maxHr: null,
      elevationGainM: null,
      feel: null,
      rpe: null,
    };
    expect(garminActivitySchema.parse(activity)).toEqual(activity);
    expect(() => garminActivitySchema.parse({ ...activity, id: "42" })).toThrow();
  });

  it("accept laps, daily signals and the created workout id", () => {
    expect(garminLapSchema.parse({ durationS: 200, distanceM: 800, avgSpeedMps: null, avgHr: 170 }).avgHr).toBe(170);
    const daily = {
      date: "2026-11-16",
      sleepS: 27000,
      sleepScore: null,
      restingHr: 52,
      stressAvg: 31,
      bodyBatteryAtWake: 78,
      bodyBatteryHighest: 80,
      vo2Max: null,
    };
    expect(garminDailySignalsSchema.parse(daily)).toEqual(daily);
    expect(() => garminDailySignalsSchema.parse({ ...daily, date: "hier" })).toThrow();
    expect(createdWorkoutSchema.parse({ workoutId: 987 })).toEqual({ workoutId: 987 });
  });
});

describe("workoutRequestSchema", () => {
  const intervals = {
    name: "Fractionné 6 x 800 m",
    date: "2026-11-18",
    steps: [
      { kind: "warmup", durationS: 900, pace: { slowMps: mps(385), fastMps: mps(375) } },
      {
        kind: "repeat",
        iterations: 6,
        steps: [
          { kind: "interval", distanceM: 800, pace: { slowMps: mps(300), fastMps: mps(290) } },
          { kind: "recovery", durationS: 120 },
        ],
      },
      { kind: "cooldown", durationS: 600 },
    ],
  };

  it("accepts a structured interval session", () => {
    expect(workoutRequestSchema.parse(intervals)).toEqual(intervals);
  });

  it.each([
    ["no end condition", { kind: "interval" }],
    ["two end conditions", { kind: "interval", durationS: 60, distanceM: 200 }],
    ["inverted pace range", { kind: "interval", durationS: 60, pace: { slowMps: 4, fastMps: 3 } }],
    ["unknown kind", { kind: "sprint", durationS: 60 }],
    ["empty repeat", { kind: "repeat", iterations: 3, steps: [] }],
  ])("rejects a step with %s", (_, step) => {
    expect(() => workoutRequestSchema.parse({ ...intervals, steps: [step] })).toThrow();
  });
});
