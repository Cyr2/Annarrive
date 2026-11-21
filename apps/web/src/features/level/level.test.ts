import { describe, expect, it } from "vitest";
import { seedLevel } from "../../api/mock/level.ts";
import { chronos, figures, footnote } from "./level.ts";

const anna = seedLevel("2026-11-16");

describe("Ton niveau", () => {
  it("shows VO2max with F19's reading, the threshold pace and heart rate with their source", () => {
    expect(figures(anna)).toEqual([
      { label: "VO2max", value: "45", detail: "Garmin, au-dessus de ta course" },
      { label: "Allure seuil", value: "5'05", unit: "/km", detail: "Calculée le 12 novembre" },
      { label: "FC seuil", value: "172", unit: "bpm", detail: "Tes 2 séances au seuil" },
    ]);
  });

  it("leaves out a missing VO2max and says when the threshold heart rate will be measured", () => {
    const { vo2max: _, thresholdHr: __, ...thin } = anna;
    expect(figures({ ...thin, provisional: true }).map((f) => [f.label, f.value, f.detail])).toEqual([
      ["Allure seuil", "5'05", "Estimée avant ta première course"],
      ["FC seuil", "À mesurer", "Se lit sur une séance au seuil"],
    ]);
  });

  it("lists the four race times, the goal marked, the marathon as a best case", () => {
    expect(chronos(anna).map((c) => [c.label, c.value, c.bestCase, c.goal])).toEqual([
      ["5 km", "24:06", false, false],
      ["10 km", "50:01", false, false],
      ["Semi", "1:51", false, true],
      ["Marathon", "3:53", true, false],
    ]);
    expect(footnote(anna)).toBe("À quelques minutes près, si tu prépares la distance.");
  });

  it("puts « ≈ » before each time while her level is provisional, and waits for longer runs", () => {
    const thin = { ...anna, provisional: true, predictions: [{ distanceM: 5000, min: 25 }, { distanceM: 42195 }] };
    expect(chronos(thin).map((c) => [c.value, c.detail])).toEqual([
      ["≈ 25:00", undefined],
      ["Pas encore", "Après des sorties plus longues"],
    ]);
    expect(footnote(thin)).toContain("en attendant ta première course mesurée");
  });
});
