import { describe, expect, it } from "vitest";
import {
  createEventInputSchema,
  deleteEventQuerySchema,
  icsUrlSchema,
  isoWeekSchema,
  profilePatchSchema,
  updateEventInputSchema,
} from "../src/index.ts";

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
