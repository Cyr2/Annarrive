import { describe, expect, it } from "vitest";
import { minutesIn, shapeOf } from "./session-shape.ts";

describe("shapeOf", () => {
  it("draws warm-up, every pass of a repeat with the recovery between, then cool-down", () => {
    const bars = shapeOf([
      { label: "Échauffement · 15 min", tone: "plain", minutes: 15 },
      {
        repeat: 6,
        steps: [
          { label: "800 m", tone: "hard", minutes: 4 },
          { label: "Récupérer · 2 min", tone: "muted", minutes: 2 },
        ],
      },
      { label: "Retour au calme · 10 min", tone: "plain", minutes: 10 },
    ]);
    expect(bars.filter((b) => b.level === 1)).toHaveLength(6);
    expect(bars.filter((b) => b.kind === "muted")).toHaveLength(5);
    expect(bars[0]).toEqual({ level: 0.52, weight: 3, kind: "plain" });
    expect(bars.at(-1)).toEqual({ level: 0.52, weight: 2, kind: "plain" });
  });

  it("draws a group without recovery as its passes alone, and caps the repeats", () => {
    expect(shapeOf([{ repeat: 4, steps: [{ label: "1 km", tone: "hard" }] }]).map((b) => b.level)).toEqual([
      1, 1, 1, 1,
    ]);
    expect(shapeOf([{ repeat: 40, steps: [{ label: "100 m", tone: "hard" }] }])).toHaveLength(12);
  });

  it("reads hours and minutes from a label without minutes", () => {
    expect(minutesIn("1 h 10 en endurance")).toBe(70);
    expect(minutesIn("45 min en endurance")).toBe(45);
    expect(minutesIn("6 lignes droites de 20 s")).toBeUndefined();
  });
});
