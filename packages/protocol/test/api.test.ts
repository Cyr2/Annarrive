import { describe, expect, it } from "vitest";
import {
  agreeWith,
  createEventInputSchema,
  deleteEventQuerySchema,
  feasibilityInputSchema,
  IMPLAUSIBLE_TIME,
  icsUrlSchema,
  isoWeekSchema,
  plausibleTime,
  profilePatchSchema,
  programInputSchema,
  runTypeSchema,
  sessionNames,
  sessionTitle,
  updateEventInputSchema,
} from "../src/index.ts";

describe("session names", () => {
  it("names every run type once, in words Anna reads", () => {
    const names = runTypeSchema.options.map((type) => sessionNames[type]);
    expect(new Set(names).size).toBe(names.length);
    expect(names.join(" ")).not.toMatch(/endurance fondamentale|VO2|Ta course/);
  });

  it("titles a footing with strides the same whatever their form (G5, N-F4)", () => {
    const sprints = [{ kind: "warmup" }, { kind: "strides" }, { kind: "recover" }, { kind: "cooldown" }];
    const strides = [{ kind: "work" }, { kind: "strides" }];
    expect(sessionTitle({ type: "E", steps: sprints })).toBe("Footing et accélérations");
    expect(sessionTitle({ type: "E", steps: strides })).toBe("Footing et accélérations");
    expect(sessionTitle({ type: "E", steps: [{ kind: "work" }] })).toBe("Footing");
    expect(sessionTitle({ type: "R", steps: strides })).toBe("Vitesse");
  });

  it("agrees « passé » and « fait » with the name", () => {
    expect(agreeWith("E", "fait")).toBe("fait");
    expect(agreeWith("L", "passé")).toBe("passée");
    expect(agreeWith("SPE", "fait")).toBe("faite");
  });
});

describe("feasibility input", () => {
  it("needs the target time she typed", () => {
    const goal = { distanceM: 10000, date: "2027-04-11" };
    expect(feasibilityInputSchema.safeParse(goal).success).toBe(false);
    expect(feasibilityInputSchema.parse({ ...goal, targetMin: 55 }).targetMin).toBe(55);
  });
});

describe("race name", () => {
  const input = (name: string) =>
    programInputSchema.safeParse({ goal: { distanceM: 10000, date: "2027-04-11", name } });
  it("is trimmed, optional, and empty means none", () => {
    expect(input("  Semi de Strasbourg ").data?.goal?.name).toBe("Semi de Strasbourg");
    expect(input("   ").data?.goal?.name).toBeUndefined();
    expect(programInputSchema.parse({ goal: { distanceM: 10000, date: "2027-04-11" } }).goal?.name).toBeUndefined();
  });
  it("refuses more than 40 characters", () => {
    expect(input("x".repeat(41)).success).toBe(false);
    expect(input("x".repeat(40)).success).toBe(true);
  });
});

// Audit robustesse-2, 12: « Ton dernier chrono » took 0 h 05 for a half marathon.
describe("declared time", () => {
  it("takes a time a runner can run on that distance, not a typo", () => {
    const semi = 21097.5;
    expect(plausibleTime(semi, 5)).toBe(false);
    expect(plausibleTime(semi, 599)).toBe(false);
    expect(plausibleTime(semi, 110)).toBe(true);
    expect(plausibleTime(5000, 13)).toBe(true);
    expect(plausibleTime(42195, 360)).toBe(true);
    const refused = programInputSchema.safeParse({ declaredTime: { distanceM: semi, minutes: 5 } });
    expect(refused.error?.issues[0]?.message).toBe(IMPLAUSIBLE_TIME);
    expect(programInputSchema.safeParse({ declaredTime: { distanceM: semi, minutes: 110 } }).success).toBe(true);
    const goal = { distanceM: 10000, date: "2027-04-11", targetMin: 55 };
    expect(feasibilityInputSchema.safeParse({ ...goal, declaredTime: { distanceM: 10000, minutes: 1 } }).success).toBe(
      false,
    );
  });
});

const event = {
  kind: "strength",
  title: "Jambes",
  start: "2026-11-17T18:00",
  end: "2026-11-17T19:00",
  recurrence: "weekly",
};

describe("calendar event inputs", () => {
  it("accepts an event that ends after it starts", () => {
    expect(createEventInputSchema.parse(event).title).toBe("Jambes");
  });

  it("rejects an event that ends before it starts, on create and update", () => {
    expect(createEventInputSchema.safeParse({ ...event, end: "2026-11-17T17:00" }).success).toBe(false);
    expect(updateEventInputSchema.safeParse({ start: "2026-11-17T18:00", end: "2026-11-17T17:00" }).success).toBe(
      false,
    );
    expect(updateEventInputSchema.safeParse({ title: "Haut du corps" }).success).toBe(true);
  });

  it("needs a date to delete one occurrence or the following ones", () => {
    expect(deleteEventQuerySchema.safeParse({ scope: "occurrence" }).success).toBe(false);
    expect(deleteEventQuerySchema.parse({ scope: "following", date: "2026-11-24" }).scope).toBe("following");
    expect(deleteEventQuerySchema.parse({ scope: "all" }).scope).toBe("all");
  });
});

describe("isoWeekSchema", () => {
  it("accepts ISO weeks only", () => {
    expect(isoWeekSchema.safeParse("2026-W47").success).toBe(true);
    expect(isoWeekSchema.safeParse("2026-W54").success).toBe(false);
  });
});

describe("icsUrlSchema", () => {
  it("accepts an https feed and refuses anything else with a French hint", () => {
    expect(icsUrlSchema.parse("https://edt.univ.fr/anna.ics")).toBe("https://edt.univ.fr/anna.ics");
    for (const url of ["http://edt.univ.fr/anna.ics", "webcal://edt.univ.fr/anna.ics", "pas un lien"]) {
      expect(icsUrlSchema.safeParse(url).error?.issues[0]?.message).toBe("Colle un lien qui commence par https://.");
    }
  });

  it("is never patched with the other settings", () => {
    expect(profilePatchSchema.parse({ icsUrl: "https://edt.univ.fr/anna.ics" })).toEqual({});
  });
});
