import { describe, expect, it } from "vitest";
import type { Session } from "../src/index.ts";
import {
  addDays,
  betterSolution,
  checkHard,
  daysBetween,
  freeSlots,
  isHard,
  placeWeek,
  proposeMoveSlots,
  replan,
  runWindowMin,
  slotAt,
  slotReason,
  softPenalty,
  usualHour,
  usualHours,
  weekDates,
  weekday,
} from "../src/index.ts";
import { block, blockDays, easy, hard, LEGS, long, MONDAY, SETTINGS, week } from "./fixtures.ts";

const ids = (r: ReturnType<typeof checkHard>): string[] => r.map((v) => v.ruleId);
const q = hard("q", "");
const e = easy("e", "");
const at = (s: Session, start: string) => slotAt(s, start);
const hardPairs = (sessions: Session[]): number => {
  const days = sessions.filter(isHard).map((s) => s.start);
  return days.filter((a, i) => days.some((b, j) => j > i && Math.abs(daysBetween(a, b)) === 1)).length;
};

describe("checkHard (H1 to H7)", () => {
  it("refuses a Q 22 h after legs (PL-1)", () => {
    const v = checkHard(q, at(q, "2026-11-25T17:00"), week([]));
    expect(v).toContainEqual({ ruleId: "H5", message: "Moins de 24 h après ta séance jambes" });
  });

  it("accepts a Q 24.5 h after legs, with S2 = 39.2 and S1 = 30 (PL-2)", () => {
    const slot = at(q, "2026-11-25T19:30");
    expect(checkHard(q, slot, week([]))).toEqual([]);
    const items = softPenalty(q, slot, week([])).items;
    expect(items.find((i) => i.id === "S2")?.pts).toBeCloseTo(39.2, 1);
    expect(items.find((i) => i.id === "S1")?.pts).toBe(30);
  });

  it("refuses a run ending less than 1 h before bedtime (PL-3)", () => {
    expect(ids(checkHard(e, at(e, "2026-11-23T21:30"), week([])))).toContain("H7");
  });

  it("refuses a run before the earliest hour (PL-4)", () => {
    expect(ids(checkHard(e, at(e, "2026-11-23T06:30"), week([])))).toContain("H2");
  });

  // Her « Pas après 0:00 » of 23 November: midnight, not the start of the day (PL-26).
  it("reads a latest end of 00:00 as midnight", () => {
    const late = { ...SETTINGS, earliest: "10:00", latestEnd: "00:00", bedtime: "01:00" };
    expect(checkHard(e, at(e, "2026-11-23T23:00"), week([], [], late))).toEqual([]);
    expect(ids(checkHard(e, at(e, "2026-11-23T09:30"), week([], [], late)))).toEqual(["H2"]);
    expect(runWindowMin(late)).toBe(14 * 60);
    expect(runWindowMin({ ...late, latestEnd: "10:20" })).toBe(20);
    expect(runWindowMin({ ...SETTINGS, earliest: "22:30" })).toBe(0);
  });

  it("refuses calendar overlaps with the 30 min buffer after, no-run days and two runs a day", () => {
    expect(ids(checkHard(e, at(e, "2026-11-24T19:00"), week([])))).toContain("H1");
    const noMonday = { ...SETTINGS, noRunDays: [0] };
    expect(ids(checkHard(e, at(e, "2026-11-23T08:00"), week([], [], noMonday)))).toEqual(["H2"]);
    expect(ids(checkHard(e, at(e, "2026-11-23T18:00"), week([easy("x", "2026-11-23T08:00")])))).toEqual(["H3"]);
  });

  it("ends a run `travelMin` before a class, 30 min for a new profile (PL-21)", () => {
    const course = block("c", "2026-11-25T10:15", "2026-11-25T12:15", "class");
    const travel = { ...SETTINGS, travelMin: 30 };
    expect(checkHard(e, at(e, "2026-11-25T09:00"), week([], [course], travel))).toEqual([]);
    expect(ids(checkHard(e, at(e, "2026-11-25T09:15"), week([], [course], travel)))).toEqual(["H1"]);
    expect(checkHard(e, at(e, "2026-11-25T09:15"), week([], [course]))).toEqual([]);
  });

  it("keeps her travel time on both sides of work, and a hard run away from just before physical work (PL-28)", () => {
    const work = block("w", "2026-11-26T14:00", "2026-11-26T17:00", "work");
    const travel = { ...SETTINGS, travelMin: 45 };
    expect(checkHard(e, at(e, "2026-11-26T12:30"), week([], [work], travel))).toEqual([]);
    expect(ids(checkHard(e, at(e, "2026-11-26T12:45"), week([], [work], travel)))).toEqual(["H1"]);
    expect(ids(checkHard(e, at(e, "2026-11-26T17:30"), week([], [work], travel)))).toEqual(["H1"]);
    expect(checkHard(e, at(e, "2026-11-26T17:45"), week([], [work], travel))).toEqual([]);
    const physical = { ...work, legs: true };
    expect(checkHard(q, at(q, "2026-11-26T12:30"), week([], [physical]))).toContainEqual({
      ruleId: "H6",
      message: "Moins d'1 h entre ta course et ton travail physique",
    });
    expect(checkHard(e, at(e, "2026-11-26T12:30"), week([], [physical]))).toEqual([]);
    expect(checkHard(q, at(q, "2026-11-26T08:00"), week([], [physical]))).toEqual([]);
    expect(softPenalty(q, at(q, "2026-11-26T08:00"), week([], [physical])).items.map((i) => i.id)).toContain("S4");
    expect(checkHard(q, at(q, "2026-11-27T08:00"), week([], [physical]))).toEqual([]);
  });

  it("refuses consecutive hard days and a hard run less than 1 h before legs the same day", () => {
    expect(ids(checkHard(q, at(q, "2026-11-27T08:00"), week([long("l", "2026-11-28T09:00")])))).toEqual(["H4"]);
    expect(ids(checkHard(q, at(q, "2026-11-24T16:30"), week([])))).toEqual(["H6"]);
    expect(checkHard(q, at(q, "2026-11-24T08:00"), week([]))).toEqual([]);
  });

  it("allows 12 h after a light legs session", () => {
    const light = { ...LEGS, light: true };
    expect(checkHard(q, at(q, "2026-11-25T08:00"), week([], [light]))).toEqual([]);
    expect(ids(checkHard(q, at(q, "2026-11-25T06:00"), week([], [light], { ...SETTINGS, earliest: "05:00" })))).toEqual(
      ["H5"],
    );
  });

  it("handles a bedtime after midnight", () => {
    expect(
      checkHard(e, at(e, "2026-11-23T22:30"), week([], [], { ...SETTINGS, latestEnd: "23:30", bedtime: "00:30" })),
    ).toEqual([]);
  });
});

describe("softPenalty (S1 to S12)", () => {
  const items = (s: Session, start: string, w = week([])): string[] =>
    softPenalty(s, at(s, start), w).items.map((i) => i.id);

  it("penalises an easy run soon after legs and a Q just before legs", () => {
    expect(items(e, "2026-11-24T19:30")).toContain("S3");
    expect(items(q, "2026-11-24T14:00")).toContain("S4");
  });

  it("penalises runs before an exam", () => {
    const exam = block("x", "2026-11-26T08:00", "2026-11-26T10:00", "exam");
    expect(items(q, "2026-11-25T20:00", week([], [exam]))).toEqual(expect.arrayContaining(["S1", "S5"]));
    expect(items(e, "2026-11-26T07:00", week([], [exam]))).toContain("S6");
  });

  it("follows preferences and last week's habits", () => {
    const prefs = { ...SETTINGS, preferredHour: "18:00" };
    const l = long("l", "");
    const w = { ...week([], [], prefs), prev: [long("old", "2026-11-15T09:00")] };
    const p = softPenalty(l, at(l, "2026-11-28T08:00"), w);
    expect(p.items).toEqual(
      expect.arrayContaining([
        { id: "S7", pts: 20 },
        { id: "S8", pts: 10 },
        { id: "S9", pts: 5 },
      ]),
    );
    expect(softPenalty(l, at(l, "2026-11-23T08:00"), w).items).toContainEqual({ id: "S8", pts: 20 });
  });

  it("penalises long gaps, non-legs strength before a Q and two Q within 48 h", () => {
    expect(items(e, "2026-11-27T08:00", week([easy("x", "2026-11-23T08:00")], []))).toContain("S10");
    const upper = { ...block("u", "2026-11-25T06:00", "2026-11-25T07:00", "strength"), legs: false };
    expect(items(q, "2026-11-25T08:00", week([], [upper]))).toContain("S11");
    expect(items(q, "2026-11-25T18:00", week([hard("q0", "2026-11-23T20:00")], []))).toContain("S12");
  });
});

describe("freeSlots", () => {
  it("lists 30 min slots that avoid the calendar, the bounds and bedtime", () => {
    const slots = freeSlots("2026-11-24", [LEGS], SETTINGS, 60);
    expect(slots[0]?.start).toBe("2026-11-24T07:00");
    expect(slots.some((s) => s.start === "2026-11-24T17:30")).toBe(false);
    expect(slots.at(-1)?.end).toBe("2026-11-24T22:00");
  });
});

describe("placeWeek (A1 to A4)", () => {
  const evenings = [
    ...["2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26"].map((d) =>
      block(`day-${d}`, `${d}T06:00`, `${d}T17:00`),
    ),
    ...blockDays(["2026-11-27", "2026-11-28", "2026-11-29"]),
    LEGS,
  ];
  const four = [hard("q1", "", 60, { priority: 2 }), easy("e", ""), hard("q2", "", 60, { priority: 3 }), long("l", "")];

  it("relaxes H4 once when three hard runs only fit on four consecutive days, deterministically (PL-5)", () => {
    const a = placeWeek(four, evenings, SETTINGS, MONDAY);
    const b = placeWeek(four, evenings, SETTINGS, MONDAY);
    expect(a.relaxations).toEqual(["A4a"]);
    expect(a.warnings.map((w) => w.ruleId)).toEqual(["A4a"]);
    expect(hardPairs(a.week.sessions)).toBe(1);
    expect(a.week.sessions.every((s) => s.start !== "")).toBe(true);
    expect(b.week.sessions).toEqual(a.week.sessions);
  });

  it("keeps A1b when H4 is relaxed: no three days in a row while a relaxed week without them fits (PL-29)", () => {
    // Jumeau, graine 18 : jambes lundi soir, ni lundi ni vendredi, la Q et la L fixées jeudi et dimanche.
    const legs = { ...LEGS, start: "2026-11-23T18:00", end: "2026-11-23T19:00" };
    const settings = { ...SETTINGS, noRunDays: [0, 4], latestEnd: "19:30" };
    const fixed = [
      hard("i", "2026-11-26T18:00", 45, { manual: true }),
      long("l", "2026-11-29T09:00", 90, { manual: true }),
    ];
    const r = placeWeek([...fixed, hard("t", "", 45, { priority: 2 }), easy("e", "", 30)], [legs], settings, MONDAY);
    expect(r.relaxations).toEqual(["A4a"]);
    const days = r.week.sessions.map((s) => weekday(s.start)).sort();
    expect(days).toHaveLength(4);
    expect(days.some((d) => days.includes(d + 1) && days.includes(d + 2))).toBe(false);
  });

  it("runs the long run as a footing when every free day follows a legs session, never drops it (A4e, PL-31)", () => {
    // Jumeau, graine 42 : la sortie longue de la semaine disparaissait à sa reconstruction du dimanche.
    const free = "2026-11-25";
    const cal = [
      ...blockDays(weekDates(MONDAY).filter((d) => d !== free)),
      { ...LEGS, start: `${free}T06:00`, end: `${free}T07:00` },
    ];
    const r = placeWeek([long("l", "", 60)], cal, SETTINGS, MONDAY);
    expect(r.week.sessions).toEqual([expect.objectContaining({ id: "l", type: "E", durMin: 60 })]);
    expect(r.week.sessions[0]?.start.slice(0, 10)).toBe(free);
    expect(r.relaxations.at(-1)).toBe("A4e");
  });

  it("places what fits when the week has fewer free days than runs, the lowest priority left out (A4, PL-34)", () => {
    // Jumeau, graine 64 : un seul jour libre pour deux courses, et la semaine reconstruite les perdait toutes les deux.
    const free = "2026-11-25";
    const r = placeWeek(
      [long("l", ""), hard("q", "", 45, { priority: 3 })],
      blockDays(weekDates(MONDAY).filter((d) => d !== free)),
      SETTINGS,
      MONDAY,
    );
    expect(r.week.sessions.filter((s) => s.start !== "").map((s) => [s.id, s.start.slice(0, 10)])).toEqual([
      ["l", free],
    ]);
    expect(r.warnings.at(-1)?.ruleId).toBe("A4");
  });

  it("fits a run to her hours when they leave a shorter window, never drops it (A4f, PL-32)", () => {
    // Jumeau, graine 37 : « Pas avant 21:00 », « Pas après 21:30 », une sortie longue de 45 min disparue.
    const settings = { ...SETTINGS, earliest: "21:00", latestEnd: "21:30", bedtime: "23:30" };
    const r = placeWeek([long("l", "", 45)], [], settings, MONDAY);
    expect(r.week.sessions.map((s) => [s.id, s.durMin, s.start !== ""])).toEqual([["l", 30, true]]);
    expect(r.relaxations.at(-1)).toBe("A4f");
  });

  it("prefers the earliest of two equal slots (PL-6)", () => {
    const cal = [
      ...blockDays(weekDates(MONDAY).filter((d) => d !== "2026-11-24")),
      block("am", "2026-11-24T07:45", "2026-11-24T11:30"),
      block("pm", "2026-11-24T12:45", "2026-11-24T23:30"),
    ];
    expect(placeWeek([easy("e", "")], cal, SETTINGS, MONDAY).week.sessions[0]?.start).toBe("2026-11-24T07:00");
  });

  it("places her runs at the hour she usually runs when she stated none (PL-20)", () => {
    // Parcours F1: every run went to 7:00, the earliest slot, while her Garmin runs all start between 17:00 and 18:30.
    const history = [
      "17:00",
      "18:30",
      "18:30",
      "17:30",
      "18:00",
      "18:30",
      "07:00",
      "18:30",
      "18:30",
      "18:00",
      "18:30",
    ].map((clock, i) => ({ start: `2026-11-${String(10 + i).padStart(2, "0")}T${clock}` }));
    expect(usualHour(history)).toBe("18:30");
    expect(usualHour(history.slice(0, 2))).toBe("18:00");
    expect(usualHour([{ start: "2026-11-10T18:10" }])).toBe("18:00");
    expect(usualHour([])).toBeUndefined();
    const settings = { ...SETTINGS, preferredHour: usualHour(history) };
    const r = placeWeek([long("l", ""), easy("e1", ""), easy("e2", "")], [LEGS], settings, MONDAY);
    // The long run ends before the evening (S1): an hour earlier.
    expect(r.week.sessions.map((s) => s.start.slice(11))).toEqual(["17:30", "18:30", "18:30"]);
    // Without a stated hour or a run: the earliest free slot, as before (PL-6).
    expect(placeWeek([easy("e", "")], [], SETTINGS, MONDAY).week.sessions[0]?.start.slice(11)).toBe("07:00");
  });

  it("reads her weekday, weekend and long-run hours apart (PL-22)", () => {
    // Audit parcours réel G1: footings at 18:30 in the week, long runs on Sunday mornings; all were put at 18:30.
    const weeks = ["2026-10-26", "2026-11-02", "2026-11-09", "2026-11-16"];
    const history = weeks.flatMap((monday) => [
      { start: `${monday}T18:30`, durMin: 45 },
      { start: `${addDays(monday, 3)}T18:30`, durMin: 40 },
      { start: `${addDays(monday, 5)}T09:30`, durMin: 50 },
      { start: `${addDays(monday, 6)}T09:30`, durMin: 95 },
    ]);
    expect(usualHours(history)).toEqual({ weekday: "18:30", weekend: "09:30", long: "09:30" });
    expect(usualHours([{ start: "2026-11-17T18:00", durMin: 40 }])).toEqual({ weekday: "18:00", long: "18:00" });
    expect(usualHours([])).toEqual({});
    const settings = { ...SETTINGS, usualHours: usualHours(history) };
    const r = placeWeek([long("l", ""), easy("e1", ""), easy("e2", "")], [LEGS], settings, MONDAY);
    const at = (id: string) => r.week.sessions.find((s) => s.id === id)?.start ?? "";
    expect(at("l").slice(11)).toBe("09:30");
    expect(weekday(at("l"))).toBeGreaterThanOrEqual(5);
    expect([at("e1"), at("e2")].filter((s) => weekday(s) < 5).every((s) => s.endsWith("18:30"))).toBe(true);
    // A stated hour still wins for every run.
    const stated = placeWeek([long("l", "")], [LEGS], { ...settings, preferredHour: "17:00" }, MONDAY);
    expect(stated.week.sessions[0]?.start.slice(11)).toBe("17:00");
  });

  it("keeps fixed sessions and places the rest by priority", () => {
    const manual = easy("m", "2026-11-23T08:00", 45, { manual: true });
    const r = placeWeek([manual, long("l", "")], [], SETTINGS, MONDAY);
    expect(r.relaxations).toEqual([]);
    expect(r.week.sessions.find((s) => s.id === "m")?.start).toBe("2026-11-23T08:00");
    expect(r.week.sessions.find((s) => s.id === "l")?.start).not.toBe("");
  });

  it("shortens, drops an E, then degrades a Q when nothing else fits", () => {
    const cal = blockDays(weekDates(MONDAY).slice(1));
    const r = placeWeek([hard("q1", ""), easy("e1", ""), easy("e2", "")], cal, SETTINGS, MONDAY);
    expect(r.relaxations).toEqual(["A4a", "A4b", "A4c", "A4d"]);
    expect(r.warnings.at(-1)?.ruleId).toBe("A4");
  });

  it("never drops the long run", () => {
    const r = placeWeek([long("l", "")], blockDays(weekDates(MONDAY)), SETTINGS, MONDAY);
    expect(r.week.sessions.map((s) => s.id)).toEqual(["l"]);
  });
});

describe("replan (A2, A3, A5, H9, H10)", () => {
  const thursday = easy("e", "2026-11-26T18:00");
  const course = block("c", "2026-11-26T17:00", "2026-11-26T19:00", "class");

  it("moves a conflicting E later the same day (PL-7)", () => {
    const r = replan(week([thursday], [LEGS, course]), "EV15", "2026-11-25T10:00");
    expect(r.changes).toHaveLength(1);
    expect(r.week.sessions[0]?.start).toBe("2026-11-26T19:30");
  });

  it("only proposes slots for a session starting within 12 h (PL-8)", () => {
    const r = replan(week([thursday], [LEGS, course]), "EV15", "2026-11-26T08:00");
    expect(r.changes).toEqual([]);
    expect(r.week.sessions[0]?.start).toBe("2026-11-26T18:00");
    expect(r.proposals[0]?.slots).toHaveLength(3);
  });

  it("keeps a manual long run, warns H4 and moves the Q of the next day (PL-9)", () => {
    const l = long("l", "2026-11-28T09:00", 90, { manual: true });
    const sunday = hard("q", "2026-11-29T09:00");
    const r = replan(week([l, sunday]), "EV14", "2026-11-23T08:00");
    expect(r.warnings).toContainEqual(expect.objectContaining({ ruleId: "H4", sessionId: "l" }));
    const moved = r.week.sessions.find((s) => s.id === "q");
    expect(moved?.start.startsWith("2026-11-29")).toBe(false);
    expect(r.week.sessions.find((s) => s.id === "l")?.start).toBe("2026-11-28T09:00");
  });

  it("degrades the Q to an E when it cannot move (PL-9)", () => {
    const l = long("l", "2026-11-28T09:00", 90, { manual: true });
    const cal = blockDays(weekDates(MONDAY).slice(0, 6));
    const r = replan(week([l, hard("q", "2026-11-29T09:00")], cal), "EV14", "2026-11-23T08:00");
    expect(r.changes[0]?.ruleId).toBe("A4d");
    expect(r.week.sessions.find((s) => s.id === "q")?.type).toBe("E");
  });

  // Audit 26/11/2026: a run that fit nowhere went « skipped » without a word, and never came back (PL-27).
  it("keeps a run that fits nowhere planned at its place, with a warning", () => {
    const cal = blockDays(weekDates(MONDAY));
    const run = easy("e", "2026-11-26T18:00");
    const r = replan(week([run], cal), "EV15", "2026-11-23T08:00");
    expect(r.week.sessions).toEqual([run]);
    expect(r.changes).toEqual([]);
    expect(r.warnings).toContainEqual(expect.objectContaining({ ruleId: "A4", sessionId: "e" }));
  });

  it("only moves after any change: a Q placed under A4a never turns easy in place (A4, PL-33)", () => {
    // Jumeau, graine 25 : la L placée mardi contre la T de mercredi (A4a) devenait un footing, trois jours de suite.
    const runs = [hard("q1", "2026-11-25T18:00", 45), hard("q2", "2026-11-26T18:00", 45)];
    const cal = blockDays(weekDates(MONDAY).filter((d) => d !== "2026-11-25" && d !== "2026-11-26"));
    const r = replan(week(runs, cal), "A4", "2026-11-23T08:00");
    expect(r.week.sessions).toEqual(runs);
    expect(r.changes).toEqual([]);
  });
});

describe("betterSolution (A2)", () => {
  const sol = (moved: number, penalty: number) => ({ moved, dayChanges: 0, shiftH: 0, penalty });

  it("keeps the solution with fewer moves when the extra move gains less than 50 points (PL-10)", () => {
    expect(betterSolution(sol(1, 60), sol(2, 20))).toBe(true);
    expect(betterSolution(sol(2, 20), sol(1, 60))).toBe(false);
  });

  it("lets an extra move win from 50 points", () => {
    expect(betterSolution(sol(2, 10), sol(1, 60))).toBe(true);
  });

  it("then prefers fewer day changes, smaller shifts, lower penalties", () => {
    expect(betterSolution({ ...sol(1, 50), dayChanges: 0 }, { ...sol(1, 0), dayChanges: 1 })).toBe(true);
    expect(betterSolution({ ...sol(1, 50), shiftH: 1 }, { ...sol(1, 0), shiftH: 2 })).toBe(true);
    expect(betterSolution(sol(1, 5), sol(1, 10))).toBe(true);
  });
});

describe("proposeMoveSlots (A6)", () => {
  it("returns the three best slots with a short reason and the forbidden ones with their reason", () => {
    const s = hard("q", "2026-11-26T18:00");
    const r = proposeMoveSlots("q", week([s]), "2026-11-23T08:00");
    expect(r.best).toHaveLength(3);
    expect(r.best.every((b) => b.reason.length > 0)).toBe(true);
    expect(r.best.some((b) => ["le moins gênant", "rien ne gêne"].includes(b.reason))).toBe(false);
    expect(r.forbidden).toContainEqual(
      expect.objectContaining({
        slot: expect.objectContaining({ start: "2026-11-25T17:00" }),
        reason: "Moins de 24 h après ta séance jambes",
      }),
    );
    expect(r.fallback).toBeUndefined();
  });

  it("always offers the day after when it is allowed, with a real reason for each slot (PL-16)", () => {
    // Tuesday's Q; Wednesday is allowed only from 19:00 (24 h after legs) and costs S2 and S1, so it ranks last.
    const s = hard("q", "2026-11-24T08:00");
    const r = proposeMoveSlots("q", week([s]), "2026-11-23T08:00");
    const wednesday = r.best.find((b) => b.slot.start.startsWith("2026-11-25"));
    expect(wednesday?.reason).toBe("près de ta muscu jambes");
    const sameDay = r.best.find((b) => b.slot.start.startsWith("2026-11-24"));
    if (sameDay) expect(sameDay.reason).toMatch(/^même jour, .+ plus (tard|tôt)$/);
  });

  it("names the legs session or her classes when the slot costs nothing (PL-17)", () => {
    const q2 = hard("q", "2026-11-27T19:00");
    const thursday = slotAt(q2, "2026-11-26T19:00");
    expect(slotReason(q2, thursday, week([q2]))).toBe("ta muscu jambes est mardi soir, l'écart est bon");
    const e2 = easy("e", "2026-11-27T08:00");
    const course = block("c", "2026-11-26T14:00", "2026-11-26T16:00", "class");
    expect(slotReason(e2, slotAt(e2, "2026-11-26T17:00"), week([e2], [course]))).toBe("après tes cours");
    expect(slotReason(e2, slotAt(e2, "2026-11-26T07:00"), week([e2], [course]))).toBe("avant tes cours");
    expect(slotReason(e2, slotAt(e2, "2026-11-26T07:00"), week([e2], []))).toBe("journée sans cours");
    // Said once: on a second slot the legs session tells nothing apart, her classes do (audit UX F2).
    const said = new Set(["ta muscu jambes est mardi soir, l'écart est bon"]);
    expect(slotReason(q2, thursday, week([q2], [LEGS, course]), said)).toBe("après tes cours");
  });

  it("never gives two slots the same legs reason (PL-17)", () => {
    const r = proposeMoveSlots("q", week([hard("q", "2026-11-27T19:00")]), "2026-11-23T08:00");
    const legs = r.best.filter((b) => b.reason.startsWith("ta muscu jambes"));
    expect(legs.length).toBeLessThanOrEqual(1);
  });

  it("offers a jog tonight or skipping when nothing fits (PL-11)", () => {
    const r = proposeMoveSlots(
      "q",
      week([hard("q", "2026-11-26T18:00")], blockDays(weekDates(MONDAY))),
      "2026-11-23T08:00",
    );
    expect(r.best).toEqual([]);
    expect(r.fallback).toEqual(["jog_tonight", "skip"]);
  });

  it("rejects an unknown session", () => {
    expect(() => proposeMoveSlots("nope", week([]), "2026-11-23T08:00")).toThrow("Unknown session");
  });

  it("offers a morning when one is free, even to an evening runner (PL-23)", () => {
    // Audit parcours réel G1: only « demain 18:00 » and « ce soir 20:30 » were offered.
    const evening = { ...SETTINGS, preferredHour: "18:30" };
    const e2 = easy("e", "2026-11-26T18:30");
    const r = proposeMoveSlots("e", week([e2], [], evening), "2026-11-23T08:00");
    expect(r.best).toHaveLength(3);
    expect(r.best.filter((b) => b.slot.start.slice(11) < "12:00")).toHaveLength(1);
    expect(r.best.some((b) => b.slot.start.startsWith("2026-11-27"))).toBe(true);
    // Mornings all taken: nothing is forced.
    const mornings = weekDates(MONDAY).map((d, i) => block(`m${i}`, `${d}T07:00`, `${d}T12:30`));
    const none = proposeMoveSlots("e", week([e2], mornings, evening), "2026-11-23T08:00");
    expect(none.best.every((b) => b.slot.start.slice(11) >= "12:00")).toBe(true);
  });
});

describe("holidays (H13)", () => {
  it("keeps quality sessions and tests off 24, 25, 31 December and 1 January (PL-24)", () => {
    const xmas = "2026-12-21";
    const holidayWeek = (sessions: Session[]) => ({ ...week(sessions, []), monday: xmas });
    const test = { ...hard("t", ""), type: "TEST" as const };
    expect(ids(checkHard(q, at(q, "2026-12-24T18:00"), holidayWeek([])))).toEqual(["H13"]);
    expect(ids(checkHard(test, at(test, "2026-12-31T10:00"), holidayWeek([])))).toEqual(["H13"]);
    expect(ids(checkHard(q, at(q, "2027-01-01T10:00"), holidayWeek([])))).toEqual(["H13"]);
    expect(checkHard(e, at(e, "2026-12-25T10:00"), holidayWeek([]))).toEqual([]);
    const l = long("l", "");
    expect(checkHard(l, at(l, "2026-12-25T10:00"), holidayWeek([]))).toEqual([]);
    expect(checkHard(q, at(q, "2026-12-23T18:00"), holidayWeek([]))).toEqual([]);
    // Placed, the Q goes to another day.
    const r = placeWeek(
      [hard("q1", ""), easy("e1", "")],
      blockDays(["2026-12-21", "2026-12-22", "2026-12-23"]),
      SETTINGS,
      xmas,
    );
    expect(r.week.sessions.find((s) => s.id === "q1")?.start.slice(0, 10)).not.toMatch(/-12-2[45]$/);
  });
});

describe("week spread (S8, S10, S13)", () => {
  // Classes on weekdays until 16:30, the weekend free: the week of a student.
  const classes = weekDates(MONDAY)
    .slice(0, 5)
    .map((d) => block(`c-${d}`, `${d}T08:00`, `${d}T16:30`, "class"));
  const evenings = { ...SETTINGS, earliest: "17:00", latestEnd: "21:30", runsPerWeek: 3 as const };
  const base = [long("l", "", 66), easy("e1", "", 45), easy("e2", "", 45)];
  const dayIndex = (s: Session): number => weekDates(MONDAY).indexOf(s.start.slice(0, 10));
  const days = (sessions: Session[]): number[] => sessions.map(dayIndex).sort((a, b) => a - b);
  const longDay = (sessions: Session[]): number => {
    const l = sessions.find((s) => s.type === "L");
    return l ? dayIndex(l) : -1;
  };
  const noBackToBack = (d: number[]): boolean => d.every((x, i) => i === 0 || x - (d[i - 1] ?? 0) > 1);

  it("puts the long run on Sunday by default and spreads the runs over the week (PL-13)", () => {
    const r = placeWeek(base, classes, evenings, MONDAY).week.sessions;
    expect(longDay(r)).toBe(6);
    const d = days(r);
    expect(noBackToBack(d)).toBe(true);
    // Never more than two days in a row without a run, week edges included.
    expect([-1, ...d, 7].every((x, i, all) => i === 0 || x - (all[i - 1] ?? 0) <= 3)).toBe(true);
  });

  it("follows her long-run day, else the other weekend day when Sunday is taken (PL-14)", () => {
    const sat = placeWeek(base, classes, { ...evenings, preferredLongDays: [5] }, MONDAY).week.sessions;
    expect(longDay(sat)).toBe(5);
    const sundayBusy = [...classes, block("sun", "2026-11-29T06:00", "2026-11-29T23:30")];
    expect(longDay(placeWeek(base, sundayBusy, evenings, MONDAY).week.sessions)).toBe(5);
  });

  it("puts the long run on whichever accepted day is free (PL-18)", () => {
    const both = { ...evenings, preferredLongDays: [5, 6] };
    expect([5, 6]).toContain(longDay(placeWeek(base, classes, both, MONDAY).week.sessions));
    const sundayBusy = [...classes, block("sun", "2026-11-29T06:00", "2026-11-29T23:30")];
    expect(longDay(placeWeek(base, sundayBusy, both, MONDAY).week.sessions)).toBe(5);
    const saturdayBusy = [...classes, block("sat", "2026-11-28T06:00", "2026-11-28T23:30")];
    expect(longDay(placeWeek(base, saturdayBusy, both, MONDAY).week.sessions)).toBe(6);
  });

  // Audit onboarding 5: Mon, Tue, Wed then Sat, every run at 7:00, for this profile with her classes linked.
  it("spreads four runs of a student with three muscu sessions, one of them legs (PL-19)", () => {
    const cal = [
      block("haut", "2026-11-23T18:00", "2026-11-23T19:00", "strength"),
      block("anat", "2026-11-24T10:15", "2026-11-24T12:15", "class"),
      { ...block("jambes", "2026-11-25T18:00", "2026-11-25T19:00", "strength"), legs: true },
      block("bioch", "2026-11-26T13:30", "2026-11-26T17:30", "class"),
      block("gainage", "2026-11-27T18:00", "2026-11-27T19:00", "strength"),
    ];
    const anna = { ...SETTINGS, runsPerWeek: 4 as const, latestEnd: "21:30", preferredLongDays: [5, 6] };
    const prev = [
      easy("p1", "2026-11-18T07:00", 38),
      easy("p2", "2026-11-19T07:00", 36),
      easy("p3", "2026-11-20T07:00", 36),
      long("p4", "2026-11-21T07:00", 57),
    ];
    const runs = [long("l", "", 57), easy("e1", "", 36), easy("e2", "", 38), easy("e3", "", 36)];
    const d = days(placeWeek(runs, cal, anna, MONDAY, prev).week.sessions);
    expect(d).toHaveLength(4);
    // At most one pair of days in a row (4 runs in 7 days), never three, and no more than two empty days.
    expect(d.filter((x, i) => i > 0 && x - (d[i - 1] ?? 0) === 1).length).toBeLessThanOrEqual(1);
    expect([-1, ...d, 7].every((x, i, all) => i === 0 || x - (all[i - 1] ?? 0) <= 3)).toBe(true);
  });

  // Audit parcours réel 2 N-G3: Mon, Tue, Wed at 18:30 then nothing until Saturday, Thursday and Friday evenings free.
  it("never puts three runs on three days in a row when the week has room, whatever last week did (PL-25)", () => {
    const anna = { ...SETTINGS, runsPerWeek: 4 as const, preferredHour: "18:30", preferredLongDays: [5, 6] };
    const prev = [
      easy("p1", "2026-11-16T18:30", 48),
      easy("p2", "2026-11-17T18:30", 45),
      easy("p3", "2026-11-18T18:30", 45),
      long("p4", "2026-11-21T09:30", 60),
    ];
    const runs = [long("l", "", 60), easy("e1", "", 48), easy("e2", "", 45), easy("e3", "", 45)];
    const d = days(placeWeek(runs, classes, anna, MONDAY, prev).week.sessions);
    expect(d).toHaveLength(4);
    expect(d.some((x, i) => i > 1 && x - (d[i - 2] ?? 0) === 2)).toBe(false);
    // Only when nothing else fits do three days in a row come back: Thursday to Sunday taken all day.
    const busy = [3, 4, 5, 6].map((i) => {
      const day = weekDates(MONDAY)[i] ?? "";
      return block(`busy-${i}`, `${day}T06:00`, `${day}T23:30`);
    });
    const tight = placeWeek(runs.slice(1), [...classes, ...busy], anna, MONDAY, prev).week.sessions;
    expect(days(tight)).toEqual([0, 1, 2]);
  });

  it("spreads the week of 30 November of the audit, her classes as they are (PL-25)", () => {
    const monday = "2026-11-30";
    const at = (day: number, from: string, to: string) => {
      const d = weekDates(monday)[day] ?? "";
      return block(`c${day}${from}`, `${d}T${from}`, `${d}T${to}`, "class");
    };
    const cal = [
      at(0, "08:15", "10:15"),
      at(0, "13:30", "16:30"),
      at(1, "10:15", "12:15"),
      at(1, "14:00", "17:00"),
      at(2, "08:15", "12:15"),
      at(3, "09:00", "12:00"),
      at(3, "14:00", "18:00"),
      at(4, "08:15", "10:15"),
    ];
    const anna = {
      ...SETTINGS,
      runsPerWeek: 4 as const,
      latestEnd: "21:30",
      bedtime: "23:30",
      travelMin: 30,
      preferredLongDays: [5, 6],
      usualHours: { weekday: "18:30", weekend: "09:30", long: "09:30" },
    };
    const done = { status: "done" as const };
    const prev = [
      easy("p1", "2026-11-24T18:30", 33, done),
      easy("p0", "2026-11-25T18:30", 34, done),
      easy("p2", "2026-11-27T18:30", 33, done),
      long("p3", "2026-11-28T09:30", 60, done),
    ];
    const runs = [easy("w-0", "", 35), easy("w-1", "", 33), easy("w-2", "", 33), long("w-3", "", 60)];
    const placed = placeWeek(runs, cal, anna, monday, prev).week.sessions;
    const d = placed.map((s) => weekDates(monday).indexOf(s.start.slice(0, 10))).sort((a, b) => a - b);
    expect(d).toHaveLength(4);
    expect(d.some((x, i) => i > 1 && x - (d[i - 2] ?? 0) === 2)).toBe(false);
  });

  it("places four runs without two days in a row when the week has room (PL-15)", () => {
    const four = [...base, hard("q", "", 50)];
    const r = placeWeek(four, classes, { ...evenings, runsPerWeek: 4 }, MONDAY).week.sessions;
    expect(r.filter((s) => s.start !== "")).toHaveLength(4);
    expect(noBackToBack(days(r))).toBe(true);
  });
});
