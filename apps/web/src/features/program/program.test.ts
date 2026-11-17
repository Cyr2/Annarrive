import { describe, expect, it } from "vitest";
import { seedProgram } from "../../api/mock/seed.ts";
import { EMPTY, issue, toPayload } from "../onboarding/onboarding.ts";
import { runWindow } from "./DayWindow.tsx";
import { clock, countdown, secondsOf } from "./program.ts";
import { skyPhase } from "./sky.ts";

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

describe("goal card", () => {
  it("counts the days to the race, down to the day itself", () => {
    expect(countdown("2026-11-20", "2026-11-17")).toEqual({ value: "3", unit: "jours" });
    expect(countdown("2026-11-18", "2026-11-17")).toEqual({ value: "1", unit: "jour" });
    expect(countdown("2026-11-17", "2026-11-17")).toEqual({ value: "Bonne course", label: "C'est aujourd'hui" });
    expect(countdown("2026-11-16", "2026-11-17")).toEqual({ value: "Terminé", label: "Ton objectif est passé" });
  });

  it("warms the sky with the phase, and in full sun the week of the race", () => {
    const program = seedProgram("2027-01-17", new Date("2026-11-17T08:00:00Z"));
    expect(skyPhase(program, "2026-11-17")).toBe("base");
    expect(skyPhase({ ...program, weekIndex: 9 }, "2026-11-17")).toBe("peak");
    expect(skyPhase(program, "2027-01-12")).toBe("race");
    expect(skyPhase(undefined, undefined)).toBe("base");
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
  it("sends a pasted link with the profile, and holds an unreadable one", () => {
    const draft = { ...EMPTY, race: "none" as const, icsUrl: "webcal://ent.example.fr/agenda.ics" };
    expect(toPayload(draft, "2026-11-16").profile.icsUrl).toBe("https://ent.example.fr/agenda.ics");
    expect(toPayload(EMPTY, "2026-11-16").profile.icsUrl).toBeUndefined();
    expect(issue("connect", { ...EMPTY, icsUrl: "pas un lien" }, "2026-11-16")).toBeDefined();
  });
});
