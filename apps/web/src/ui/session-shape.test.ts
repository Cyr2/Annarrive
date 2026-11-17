import { describe, expect, it } from "vitest";
import { minutesIn, shapeOf } from "./session-shape.ts";

describe("shapeOf", () => {
  it("draws warm-up, one bar per repeat with the recovery between, then cool-down", () => {
    const bars = shapeOf([
      { label: "Échauffement 15 min", tone: "plain" },
      { label: "6 × 800 m", tone: "hard" },
      { label: "Récup 2 min en trottinant", tone: "muted" },
      { label: "Retour au calme 10 min", tone: "plain" },
    ]);
    // The recovery says its minutes: it is a step of its own, not the gap between repeats.
    expect(bars.filter((b) => b.level === 1)).toHaveLength(6);
    expect(bars[0]).toEqual({ level: 0.52, weight: 3 });
    expect(bars.at(-1)).toEqual({ level: 0.52, weight: 2 });
  });

  it("puts a recovery without duration between the repeats", () => {
    const bars = shapeOf([
      { label: "4 × 1 km", tone: "hard" },
      { label: "Récup en trottinant", tone: "muted" },
    ]);
    expect(bars.map((b) => b.level)).toEqual([1, 0.3, 1, 0.3, 1, 0.3, 1]);
  });

  it("reads hours and minutes, and caps the repeats", () => {
    expect(minutesIn("1 h 10 en endurance")).toBe(70);
    expect(minutesIn("45 min en endurance")).toBe(45);
    expect(minutesIn("6 lignes droites de 20 s")).toBeUndefined();
    expect(shapeOf([{ label: "40 × 100 m", tone: "hard" }])).toHaveLength(12);
  });
});
