import { describe, expect, it } from "vitest";
import { formatPace } from "../src/index.ts";

describe("formatPace", () => {
  it("shows minutes and two-digit seconds per kilometre", () => {
    expect(formatPace(295)).toBe("4:55");
    expect(formatPace(360)).toBe("6:00");
  });

  it("rounds to the nearest second", () => {
    expect(formatPace(374.6)).toBe("6:15");
  });

  it("refuses a pace that cannot exist", () => {
    expect(() => formatPace(0)).toThrow(RangeError);
    expect(() => formatPace(Number.NaN)).toThrow(RangeError);
  });
});
