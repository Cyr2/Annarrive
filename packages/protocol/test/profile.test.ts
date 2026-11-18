import { describe, expect, it } from "vitest";
import { storedProfileSchema } from "../src/index.ts";

const profile = {
  runsPerWeek: 3,
  earliest: "07:00",
  latestEnd: "21:30",
  noRunDays: [],
  bedtime: "23:00",
  useSleepHr: true,
  travelMin: 0,
  cycleTracking: false,
};

describe("storedProfileSchema", () => {
  it("turns the old single long-run day into a list of one", () => {
    expect(storedProfileSchema.parse({ ...profile, preferredLongDay: 6 }).preferredLongDays).toEqual([6]);
    expect(storedProfileSchema.parse({ ...profile, preferredLongDays: [6, 7] }).preferredLongDays).toEqual([6, 7]);
    expect(storedProfileSchema.parse(profile).preferredLongDays).toBeUndefined();
  });
});
