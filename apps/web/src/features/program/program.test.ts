import { describe, expect, it } from "vitest";
import { seedProgram } from "../../api/mock/seed.ts";
import { EMPTY, issue, toPayload } from "../onboarding/onboarding.ts";
import { runWindow } from "./DayWindow.tsx";
import { goalDateOk, nextRaceDraft, nextRaceSummary, raceTitle } from "./goal.ts";
import { clock, lastRaceLine, RACE_AGO, raceAgoOf, raceClock, raceDateOf, secondsOf, settingValue } from "./program.ts";
import { skyPhase } from "./sky.ts";
import { targetReasons } from "./TargetTag.tsx";

describe("why a target is ambitious or reachable", () => {
  const why = { currentMin: 112.4, weeks: 12, gain: 0.08, gainMax: 0.042 };
  it("says her level, the gain asked and the usual gain, never a time to aim for", () => {
    expect(targetReasons("ambitious", why)).toEqual([
      "Aujourd'hui, ton niveau te donne environ 1 h 52 sur cette course.",
      "Ta cible demande de gagner 8 % sur les 12 semaines d'entraînement du plan.",
      "En général, on gagne jusqu'à 4 % sur cette durée. Ta cible va au-delà : c'est jouable, avec peu de marge.",
    ]);
    expect(targetReasons("reachable", { ...why, gain: 0.004 })[1]).toContain("moins de 1 %");
    expect(targetReasons("reachable", { ...why, gain: 0.03 })[2]).toContain("Ta cible reste dans cette marge.");
    expect(targetReasons("reachable", { ...why, gain: -0.02 })).toHaveLength(2);
  });
});

describe("target time", () => {
  it("writes and reads a race clock", () => {
    expect(clock(6480)).toBe("1:48:00");
    expect(clock(24 * 60 + 30)).toBe("24:30");
    expect(clock(5 * 60 + 7)).toBe("5:07");
    expect(secondsOf("1:48:00")).toBe(6480);
    expect(secondsOf("1:48")).toBe(6480);
    expect(secondsOf(undefined)).toBe(0);
  });
});

describe("race title", () => {
  it("shows her name for the race, else its distance", () => {
    expect(raceTitle({ race: "Semi-marathon", name: "Semi de Strasbourg" })).toBe("Semi de Strasbourg");
    expect(raceTitle({ race: "Semi-marathon" })).toBe("Semi-marathon");
    expect(raceTitle({ race: "Semi-marathon", name: "" })).toBe("Semi-marathon");
  });
});

describe("goal card", () => {
  it("says a race time as she does: to the minute past an hour", () => {
    expect(raceClock(6480)).toBe("1:48");
    expect(raceClock(6485)).toBe("1:48:05");
    expect(raceClock(24 * 60 + 30)).toBe("24:30");
  });

  it("warms the sky with the phase, and in full sun the week of the race", () => {
    const program = seedProgram("2027-01-17", new Date("2026-11-17T08:00:00Z"));
    expect(skyPhase(program, "2026-11-17")).toBe("base");
    expect(skyPhase({ ...program, weekIndex: 9 }, "2026-11-17")).toBe("peak");
    expect(skyPhase(program, "2027-01-12")).toBe("race");
    expect(skyPhase(undefined, undefined)).toBe("base");
  });
});

describe("ton niveau", () => {
  const today = "2026-11-21";
  it("sums up her last race on one line, and reads back the months she gave", () => {
    for (const { value } of RACE_AGO) expect(raceAgoOf(raceDateOf(value, today), today)).toBe(value);
    const semi = { distanceM: 21097.5, minutes: 112, date: raceDateOf("2", today) };
    expect(lastRaceLine(semi, today)).toBe("Semi en 1:52, il y a 2 mois");
    expect(lastRaceLine({ ...semi, date: raceDateOf("0", today) }, today)).toBe("Semi en 1:52, il y a moins d'un mois");
    expect(lastRaceLine({ distanceM: 8000, minutes: 40.5 }, today)).toBe("8 km en 40:30, estimé");
  });
});

describe("réglages", () => {
  it("shows her hour, or the automatic one, and the time before a class", () => {
    const { settings } = seedProgram("2027-01-17", new Date("2026-11-17T08:00:00Z"));
    expect(settingValue("preferredHour", settings)).toBe("Automatique · vers 18:00");
    expect(settingValue("preferredHour", { ...settings, usualHour: undefined })).toBe("Automatique");
    expect(settingValue("preferredHour", { ...settings, preferredHour: "7:30" })).toBe("7:30");
    expect(settingValue("travelMin", settings)).toBe("30 min");
    expect(settingValue("travelMin", { ...settings, travelMin: 90 })).toBe("1 h 30");
  });
});

describe("run window", () => {
  it("ends runs an hour before bedtime, even after midnight", () => {
    expect(runWindow("7:00", "21:30", "23:00").text).toBe("7:00 à 21:30");
    expect(runWindow("7:00", "21:30", "22:00").text).toBe("7:00 à 21:00");
    expect(runWindow("7:00", "21:30", "0:30").text).toBe("7:00 à 21:30");
    expect(runWindow("21:00", "7:00", "23:00").text).toBe("Aucun créneau");
  });
});

describe("onboarding timetable link", () => {
  it("sends a pasted link apart from the profile, and holds an unreadable one", () => {
    const draft = { ...EMPTY, race: "none" as const, icsUrl: "webcal://ent.example.fr/agenda.ics" };
    expect(toPayload(draft, "2026-11-16").icsUrl).toBe("https://ent.example.fr/agenda.ics");
    expect(toPayload(EMPTY, "2026-11-16").icsUrl).toBeUndefined();
    expect(issue("days", { ...EMPTY, icsUrl: "pas un lien" }, "2026-11-16")).toBeDefined();
  });
});

describe("a new race after the one she ran", () => {
  const ran = {
    race: "Semi-marathon",
    distanceKm: 21.1,
    date: "2026-11-22",
    targetTime: "1:48:00",
    startTime: "9:30",
    name: "Semi de Strasbourg",
  };
  it("keeps only the distance as a suggestion: no name, date, start or chrono of the race she ran", () => {
    expect(nextRaceDraft(ran)).toEqual({ race: "Semi-marathon", distanceKm: 21.1, date: "" });
  });
  it("counts the new race from today, not from the race she ran (audit N4)", () => {
    const next = { race: "Semi-marathon", distanceKm: 21.1, date: "2027-04-11" };
    expect(nextRaceSummary(next, "2026-11-22")).toBe(
      "Semi-marathon dans 20 semaines, objectif finir. Ton plan est construit jusque-là.",
    );
    expect(nextRaceSummary({ ...next, name: "Semi de Nantes", targetTime: "1:48:00" }, "2026-11-22")).toMatch(
      /^Semi de Nantes dans 20 semaines, chrono visé 1:48:00\./,
    );
  });
  it("takes a date after today, never today or before", () => {
    expect(goalDateOk("2026-11-23", "2026-11-22")).toBe(true);
    expect(goalDateOk("2026-11-22", "2026-11-22")).toBe(false);
    expect(goalDateOk("2026-11-01", "2026-11-22")).toBe(false);
    expect(goalDateOk("", "2026-11-22")).toBe(false);
  });
  it("lets her keep the date of a race set for today while she edits it", () => {
    expect(goalDateOk("2026-11-22", "2026-11-22", "2026-11-22")).toBe(true);
  });
});
