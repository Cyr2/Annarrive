import { IMPLAUSIBLE_TIME } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import type { Item } from "../../api/schemas.ts";
import { raceDateOf } from "../program/program.ts";
import {
  COPY,
  declaredTimeOf,
  EMPTY,
  feasibilityInput,
  firstRuns,
  issue,
  nextStep,
  QUESTIONS,
  STEPS,
  toPayload,
} from "./onboarding.ts";

const today = "2026-11-18";

describe("« Ta dernière course »", () => {
  it("sends nothing when she skips it", () => {
    expect(declaredTimeOf(EMPTY, today)).toBeUndefined();
    expect(toPayload({ ...EMPTY, race: "none" }, today).program).toEqual({ goal: null });
  });

  it("dates her time with the same conversion as Réglages", () => {
    const draft = { ...EMPTY, lastSec: 110 * 60, lastAgo: "2" };
    expect(declaredTimeOf(draft, today)).toEqual({ distanceM: 21097.5, minutes: 110, date: raceDateOf("2", today) });
    expect(declaredTimeOf(EMPTY, today)).toBeUndefined();
  });

  it("feeds the level estimate of the programme and of the target's verdict", () => {
    const draft = { ...EMPTY, race: 10000 as const, date: "2027-03-14", targetSec: 52 * 60, lastSec: 55 * 60 };
    expect(toPayload(draft, today).program.declaredTime).toMatchObject({ minutes: 55 });
    expect(feasibilityInput(draft, today)?.declaredTime).toMatchObject({ minutes: 55 });
  });

  // Audit robustesse-2, 12: 0 h 05 for a half marathon went through.
  it("holds back a time no one runs on that distance", () => {
    expect(issue("last", { ...EMPTY, lastSec: 5 * 60 }, today)).toBe(IMPLAUSIBLE_TIME);
    expect(issue("last", { ...EMPTY, lastSec: 110 * 60 }, today)).toBeUndefined();
    expect(issue("last", EMPTY, today)).toBeUndefined();
  });
});

describe("« Ta course »", () => {
  it("asks for a distance and a date to come, or no goal at all", () => {
    expect(issue("race", EMPTY, today)).toBeDefined();
    expect(issue("race", { ...EMPTY, race: 10000, date: today }, today)).toBeDefined();
    expect(issue("race", { ...EMPTY, race: "other", otherKm: "abc", date: "2027-03-14" }, today)).toBeDefined();
    expect(issue("race", { ...EMPTY, race: 10000, date: "2027-03-14" }, today)).toBeUndefined();
    expect(issue("race", { ...EMPTY, race: "none" }, today)).toBeUndefined();
  });

  it("saves the target with the race, and none when the boxes stay empty", () => {
    const race = { ...EMPTY, race: 21097.5 as const, date: "2027-04-11" };
    expect(toPayload({ ...race, targetSec: 6480 }, today).program.goal).toEqual({
      distanceM: 21097.5,
      date: "2027-04-11",
      targetMin: 108,
    });
    expect(toPayload(race, today).program.goal).toEqual({ distanceM: 21097.5, date: "2027-04-11" });
    expect(feasibilityInput(race, today)).toBeUndefined();
    // A target typed before choosing « Pas d'objectif » is not sent.
    expect(toPayload({ ...EMPTY, race: "none", targetSec: 6480 }, today).program.goal).toBeNull();
  });
});

describe("steps", () => {
  it("goes one screen at a time and stays inside the flow", () => {
    expect(nextStep("welcome", 1)).toBe("race");
    expect(nextStep("race", 1)).toBe("last");
    expect(nextStep("consent", 1)).toBe("ready");
    expect(nextStep("welcome", -1)).toBe("welcome");
    expect(nextStep("ready", 1)).toBe("ready");
  });

  it("has five questions, one dot each", () => {
    expect(QUESTIONS).toEqual(["race", "last", "week", "days", "consent"]);
  });

  it("holds an unreadable timetable link", () => {
    expect(issue("days", { ...EMPTY, icsUrl: "pas un lien" }, today)).toBeDefined();
    expect(issue("days", { ...EMPTY, icsUrl: "webcal://ent.example.fr/agenda.ics" }, today)).toBeUndefined();
  });

  it("writes French copy without long dashes or exclamation marks", () => {
    for (const step of STEPS) expect(`${COPY[step].title} ${COPY[step].lead ?? ""}`).not.toMatch(/[—–!]/);
  });
});

describe("profile sent", () => {
  it("carries only what she answered, with its defaults", () => {
    expect(toPayload({ ...EMPTY, race: "none" }, today).profile).toEqual({
      runsPerWeek: 3,
      preferredLongDays: [6, 7],
      bedtime: "23:00",
      travelMin: 30,
      useSleepHr: true,
    });
  });

  it("sends her preferred hour, her days in order, and the coach's long-run day when she ticks none", () => {
    const profile = toPayload({ ...EMPTY, preferredHour: "7:30", longRunDays: [7, 3] }, today).profile;
    expect(profile.preferredHour).toBe("07:30");
    expect(profile.preferredLongDays).toEqual([3, 7]);
    expect(toPayload({ ...EMPTY, longRunDays: [] }, today).profile.preferredLongDays).toBeUndefined();
  });
});

describe("her first week", () => {
  const run = (id: string, date: string, start: string): Item => ({
    id,
    kind: "run",
    date,
    start,
    durationMin: 40,
    title: "Footing facile",
    intensity: "easy",
    pace: "6'30 /km",
    steps: [],
    why: "",
  });
  const lecture: Item = {
    id: "c",
    kind: "class",
    date: "2026-11-19",
    start: "8:00",
    end: "10:00",
    title: "Biochimie",
  };

  it("lists the runs of the seven days after today, in order, never one today", () => {
    const items = [
      run("late", "2026-11-25", "9:00"),
      run("today", today, "18:00"),
      lecture,
      run("evening", "2026-11-19", "18:00"),
      run("morning", "2026-11-19", "7:30"),
      run("after", "2026-11-26", "9:00"),
    ];
    expect(firstRuns(items, today).map((r) => r.id)).toEqual(["morning", "evening", "late"]);
  });
});
