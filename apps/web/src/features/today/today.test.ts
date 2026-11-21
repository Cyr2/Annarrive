import { describe, expect, it } from "vitest";
import type { Run } from "../../api/schemas.ts";
import { frenchSpaces } from "../reggie/Message.tsx";
import {
  beforeFirstRun,
  paceText,
  raceClock,
  restLine,
  sessionDetail,
  sinceLast,
  splitLabel,
  targetGap,
  whyQuestion,
} from "./today.ts";

describe("today, details", () => {
  it("says the same rest line all day and another one the next rest day", () => {
    expect(restLine("2026-11-17")).toBe(restLine("2026-11-17"));
    expect(restLine("2026-11-17")).not.toBe(restLine("2026-11-18"));
  });

  // Day one said « Ton corps assimile le travail des derniers jours » (audit onboarding 2).
  it("speaks of the plan to come before her first run, never of past work", () => {
    const run = { kind: "run", date: "2026-11-16" } as Run;
    const week = (index: number | undefined, items: Run[]) => ({ index, items });
    expect(beforeFirstRun(week(1, []), "2026-11-17")).toBe(true);
    expect(beforeFirstRun(week(1, [{ ...run, date: "2026-11-18" }]), "2026-11-17")).toBe(true);
    expect(beforeFirstRun(week(1, [run]), "2026-11-17")).toBe(false);
    expect(beforeFirstRun(week(2, []), "2026-11-17")).toBe(false);
    expect(beforeFirstRun(week(undefined, []), "2026-11-17")).toBe(false);
    expect(restLine("2026-11-17", true)).toBe(
      "Rien à courir aujourd'hui. Ton plan commence avec la séance juste en dessous.",
    );
  });

  it("keeps French punctuation with its word", () => {
    expect(frenchSpaces("C'est grave ? Oui : non !")).toBe("C'est grave ? Oui : non !");
  });

  it("asks Reggie about the session with its day, its goal and its steps", () => {
    const run: Run = {
      id: "s1",
      kind: "run",
      date: "2026-11-17",
      start: "18:00",
      durationMin: 50,
      title: "Seuil",
      intensity: "hard",
      pace: "5'15 /km",
      steps: [
        { label: "Échauffement · 15 min", pace: "6'37 à 7'53 /km", tone: "plain" },
        { repeat: 3, steps: [{ label: "8 min", pace: "5'15 /km", tone: "hard" }] },
      ],
      why: "",
    };
    expect(whyQuestion(run, "2026-11-17", "Semi-marathon")).toMatch(
      /^Pourquoi cette séance de Seuil aujourd'hui\s\? À quoi elle me sert pour mon semi\s\?$/,
    );
    expect(whyQuestion(run, "2026-11-17")).toMatch(/elle me sert\s\?$/);
    expect(sessionDetail(run, "2026-11-17")).toMatch(
      /^Seuil, ce soir 18:00 · Échauffement · 15 min à 6'37 à 7'53 \/km · Répéter 3 fois \(8 min à 5'15 \/km\)$/,
    );
  });
});

describe("après la course objectif, en mots", () => {
  it("writes the time to the second and the pace as a runner does", () => {
    expect(raceClock(107 + 32 / 60)).toBe("1:47:32");
    expect(raceClock(24.1)).toBe("24:06");
    expect(paceText(306.2)).toBe("5'06 /km");
  });

  it("says the gap to her target exactly, under or over, and never as an alarm (RR2)", () => {
    expect(targetGap(-28 / 60)).toEqual({ text: "28 s sous ton objectif", under: true });
    expect(targetGap(70 / 60)).toEqual({ text: "1 min 10 au-dessus de ton objectif", under: false });
    expect(targetGap(-2)).toEqual({ text: "2 min sous ton objectif", under: true });
    expect(targetGap(0.001).text).toBe("Pile ton objectif");
  });

  it("compares with her last race by its month, with its year when it is old (RR3)", () => {
    expect(sinceLast(107.5, { timeMin: 112, date: "2026-03-08" }, "2026-11-22")).toBe("4 min 30 de mieux qu'en mars");
    expect(sinceLast(113, { timeMin: 112, date: "2025-06-08" }, "2026-11-22")).toBe("1 min de plus qu'en juin 2025");
    expect(sinceLast(112, { timeMin: 112 }, "2026-11-22")).toBe("Le même temps que ton dernier chrono");
  });

  it("labels the splits from the first kilometres to the line", () => {
    expect([5, 10, 21.1].map((km, i) => splitLabel(km, i, 3))).toEqual(["5 km", "10", "Fin"]);
  });
});
