import { describe, expect, it } from "vitest";
import { swipes, swipeTarget } from "./useTabSwipe.ts";

describe("tab swipe", () => {
  it("leads to the tab beside, in the tab bar's order", () => {
    expect(swipeTarget("/", 1)).toBe("/semaine");
    expect(swipeTarget("/programme", -1)).toBe("/semaine");
    expect(swipeTarget("/programme", 1)).toBe("/reggie");
    expect(swipeTarget("/reggie", -1)).toBe("/programme");
  });

  it("stops at both ends", () => {
    expect(swipeTarget("/", -1)).toBeUndefined();
    expect(swipeTarget("/reggie", 1)).toBeUndefined();
  });

  it("leaves Semaine its swipe for the weeks, and other pages alone", () => {
    expect(swipes("/semaine")).toBe(false);
    expect(swipes("/face-id")).toBe(false);
    expect(swipes("/reggie")).toBe(true);
  });
});
