import { describe, expect, it } from "vitest";
import { settingValue } from "../features/program/program.ts";
import { toProfilePatch } from "./map.ts";
import type { Settings } from "./schemas.ts";

describe("long-run days", () => {
  it("sends her accepted days to the server, Monday = 1, and never an empty list", () => {
    expect(toProfilePatch({ longRunDays: [6, 5] })).toEqual({ preferredLongDays: [6, 7] });
    expect(toProfilePatch({ longRunDays: [] })).toEqual({});
  });

  it("names them on the Programme row", () => {
    const settings = { longRunDays: [5, 6] } as Settings;
    expect(settingValue("longRunDays", settings)).toBe("Samedi, Dimanche");
  });
});
