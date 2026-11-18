import { describe, expect, it } from "vitest";
import { gestureOf, turnOf } from "./useWeekSwipe.ts";

describe("week swipe", () => {
  const width = 360;
  it("turns to the next week past a quarter of the width to the left, the previous one to the right", () => {
    expect(turnOf(-100, 0, width)).toBe(1);
    expect(turnOf(100, 0, width)).toBe(-1);
  });
  it("turns on a short flick", () => {
    expect(turnOf(-30, -800, width)).toBe(1);
    expect(turnOf(30, 800, width)).toBe(-1);
  });
  it("leaves a vertical move to the scroll and a long press to the drag of a session", () => {
    expect(gestureOf(4, 2, 50)).toBe("unsure");
    expect(gestureOf(-40, 8, 80)).toBe("swipe");
    expect(gestureOf(12, 40, 80)).toBe("other");
    expect(gestureOf(-40, 0, 400)).toBe("other");
  });
  it("springs back on a short, slow move", () => {
    expect(turnOf(-60, -100, width)).toBe(0);
    expect(turnOf(60, 100, width)).toBe(0);
  });
});
