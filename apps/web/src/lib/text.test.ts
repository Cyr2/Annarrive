import { describe, expect, it } from "vitest";
import { tidy } from "./text.ts";

describe("tidy", () => {
  it("binds figures to their unit and a separator to the word before it", () => {
    expect(tidy("3 × 1 600 m à 5:10 · 50 min")).toBe("3 × 1 600 m à 5:10 · 50 min");
    expect(tidy("8 km environ")).toBe("8 km environ");
  });
});
