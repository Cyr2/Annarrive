import { describe, expect, it } from "vitest";
import type { Item } from "../../api/schemas.ts";
import { lanesOf, placeOf } from "./grid.ts";

const event = (id: string, start: string, end: string): Item => ({
  id,
  kind: "class",
  date: "2026-11-19",
  start,
  end,
  title: id,
});

describe("calendar grid", () => {
  it("places a span in hours from 7:00, cut to 7:00 to 22:00", () => {
    expect(placeOf("8:15", 120)).toEqual({ top: 1.25, height: 2 });
    expect(placeOf("6:30", 60)).toEqual({ top: 0, height: 0.5 });
    expect(placeOf("21:30", 60)).toEqual({ top: 14.5, height: 0.5 });
    expect(placeOf("22:30", 30)).toBeNull();
  });

  it("puts overlapping items side by side, and a later one back on the full width", () => {
    const lanes = lanesOf([
      event("a", "13:00", "16:00"),
      event("b", "13:30", "17:30"),
      event("c", "16:00", "17:00"),
      event("d", "18:00", "19:00"),
    ]);
    expect(lanes.get("a")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("b")).toEqual({ lane: 1, lanes: 2 });
    expect(lanes.get("c")).toEqual({ lane: 0, lanes: 2 });
    expect(lanes.get("d")).toEqual({ lane: 0, lanes: 1 });
  });
});
