import { describe, expect, it } from "vitest";
import { classRow, classTitle, tidy } from "./text.ts";

describe("tidy", () => {
  it("binds figures to their unit and a separator to the word before it", () => {
    expect(tidy("3 × 1 600 m à 5:10 · 50 min")).toBe("3 × 1 600 m à 5:10 · 50 min");
    expect(tidy("8 km environ")).toBe("8 km environ");
  });
});

describe("classTitle", () => {
  it("names the course and keeps its codes underneath", () => {
    expect(classTitle("(M1M2E G3 NL) UE1 Français")).toEqual({ title: "Français", detail: "UE1 · M1M2E G3 NL" });
  });

  it("copes with the feed's variants", () => {
    expect(classTitle("Français")).toEqual({ title: "Français" });
    expect(classTitle("  UE1   Français  ")).toEqual({ title: "Français", detail: "UE1" });
    expect(classTitle("(M1M2E G3 NL) Didactique des maths")).toEqual({
      title: "Didactique des maths",
      detail: "M1M2E G3 NL",
    });
    expect(classTitle("UE2 - Didactique (TD)")).toEqual({ title: "Didactique", detail: "UE2 · TD" });
    expect(classTitle("UE1/UE 2b Anglais")).toEqual({ title: "Anglais", detail: "UE1 · UE2B" });
    expect(classTitle("(G3)  ue4 :  Histoire   géo ")).toEqual({ title: "Histoire géo", detail: "UE4 · G3" });
    expect(classTitle("Physique (TP) (G2)")).toEqual({ title: "Physique", detail: "TP · G2" });
  });

  it("moves the first UE1 to UE4 into a pill, the rest of the codes stay underneath", () => {
    expect(classRow("(M1M2E G3 NL) UE1 Français")).toEqual({ title: "Français", detail: "M1M2E G3 NL", ue: "ue1" });
    expect(classRow("UE4 Allemand")).toEqual({ title: "Allemand", ue: "ue4" });
    expect(classRow("UE1/UE 2b Anglais")).toEqual({ title: "Anglais", detail: "UE2B", ue: "ue1" });
    expect(classRow("UE7 Option")).toEqual({ title: "Option", detail: "UE7" });
    expect(classRow("(M1) UE1")).toEqual({ title: "UE1", detail: "M1" });
    expect(classRow("Physique")).toEqual({ title: "Physique" });
  });

  it("falls back on the codes, then on the raw title, when no course name is left", () => {
    expect(classTitle("(M1) UE1")).toEqual({ title: "UE1", detail: "M1" });
    expect(classTitle("(M1M2E)")).toEqual({ title: "(M1M2E)" });
    expect(classTitle("")).toEqual({ title: "" });
  });
});
