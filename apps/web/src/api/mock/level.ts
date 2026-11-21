import type { Level } from "@annarrive/protocol";
import { addDays } from "../../lib/date.ts";

/** Anna's level (research 07): a half as her goal, 1:51 today, VO2max 45 from her watch, her threshold laps of the last two weeks. */
export function seedLevel(monday: string): NonNullable<Level> {
  return {
    provisional: false,
    since: addDays(monday, -4),
    // VO2max 45 against a VDOT of 40: 5 points, so « au-dessus » (F19).
    vo2max: { value: 45, date: addDays(monday, -1), versus: "above" },
    thresholdPace: 305,
    thresholdHr: { bpm: 172, from: "laps", date: addDays(monday, -5) },
    predictions: [
      { distanceM: 5000, min: 24.1 },
      { distanceM: 10000, min: 50.02 },
      { distanceM: 21097.5, min: 110.9 },
      { distanceM: 42195, min: 232.8, bestCase: true },
    ],
    goalDistanceM: 21097.5,
  };
}
