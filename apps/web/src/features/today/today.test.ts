import { describe, expect, it } from "vitest";
import type { Run } from "../../api/schemas.ts";
import { frenchSpaces } from "../reggie/Message.tsx";
import { restLine, sessionDetail, whyQuestion } from "./today.ts";

describe("today, details", () => {
  it("says the same rest line all day and another one the next rest day", () => {
    expect(restLine("2026-11-17")).toBe(restLine("2026-11-17"));
    expect(restLine("2026-11-17")).not.toBe(restLine("2026-11-18"));
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
