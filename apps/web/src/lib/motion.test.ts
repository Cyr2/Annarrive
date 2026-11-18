import { describe, expect, it, vi } from "vitest";
import { isPull } from "../ui/PullToRefresh.tsx";
import { drawnOf, type StripDay, stripChanges } from "../ui/WeekStrip.tsx";
import { SLIDE_ROW, slideFrom } from "./motion.ts";

describe("motion", () => {
  it("slides an element from where it was, and leaves it alone when it did not move", () => {
    const element = document.createElement("div");
    const animate = vi.fn();
    element.animate = animate;
    slideFrom(element, 0.4, -0.5, SLIDE_ROW);
    expect(animate).not.toHaveBeenCalled();
    slideFrom(element, 0, 24, SLIDE_ROW);
    expect(animate).toHaveBeenCalledWith([{ transform: "translate(0px, 24px)" }, { transform: "none" }], SLIDE_ROW);
  });

  it("grows the strip's bars from their old load, and pulses only the day a session landed on", () => {
    const day = (key: string, marks: StripDay["marks"]): StripDay => ({
      key,
      short: "Lun",
      number: "1",
      label: "Lun",
      today: false,
      past: false,
      marks,
      href: "#",
    });
    const before = drawnOf([day("a", [{ id: "r1", tone: "easy", minutes: 40 }]), day("b", [])], 0.5);
    const moved = drawnOf([day("a", []), day("b", [{ id: "r1", tone: "easy", minutes: 40 }])], 0.5);
    expect(stripChanges(before, moved)).toEqual({ bars: [["r1", 0]], landed: ["b"] });
    const longer = drawnOf([day("a", [{ id: "r1", tone: "easy", minutes: 80 }]), day("b", [])], 0.5);
    expect(stripChanges(before, longer)).toEqual({ bars: [["r1", 0.5]], landed: [] });
    expect(stripChanges(before, before)).toEqual({ bars: [], landed: [] });
    const nextWeek = drawnOf([day("c", [{ id: "r2", tone: "easy", minutes: 40 }])], 0.5);
    expect(stripChanges(before, nextWeek)).toEqual({ bars: [["r2", 0]], landed: [] });
  });

  it("tells a pull from a swipe, a scroll, a long press and a page already scrolled", () => {
    expect(isPull(2, 5, 50, 0)).toBe("unsure");
    expect(isPull(3, 20, 80, 0)).toBe("pull");
    expect(isPull(20, 12, 80, 0)).toBe("other");
    expect(isPull(0, -20, 80, 0)).toBe("other");
    expect(isPull(0, 20, 400, 0)).toBe("other");
    expect(isPull(0, 20, 80, 120)).toBe("other");
  });
});
