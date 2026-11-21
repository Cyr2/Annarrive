import { describe, expect, it } from "vitest";
import type { Session } from "../src/index.ts";
import {
  betterSolution,
  checkHard,
  daysBetween,
  freeSlots,
  isHard,
  placeWeek,
  proposeMoveSlots,
  replan,
  slotAt,
  slotReason,
  softPenalty,
  usualHour,
  weekDates,
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

  it("skips an easy run that fits nowhere", () => {
    const cal = blockDays(weekDates(MONDAY));
    const r = replan(week([easy("e", "2026-11-26T18:00")], cal), "EV15", "2026-11-23T08:00");
    expect(r.week.sessions[0]?.status).toBe("skipped");
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

  it("places four runs without two days in a row when the week has room (PL-15)", () => {
    const four = [...base, hard("q", "", 50)];
    const r = placeWeek(four, classes, { ...evenings, runsPerWeek: 4 }, MONDAY).week.sessions;
    expect(r.filter((s) => s.start !== "")).toHaveLength(4);
    expect(noBackToBack(days(r))).toBe(true);
  });
});
