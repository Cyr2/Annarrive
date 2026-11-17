import { describe, expect, it } from "vitest";
import type { Activity, WeekRequest } from "../src/index.ts";
import { addDays, checkHard, dateOf, isHard, planWeek, programPlan, slotOf, validateWeek } from "../src/index.ts";
import { easy, hard, LEGS, MONDAY, SETTINGS } from "./fixtures.ts";

const runs = (weeks: number, perWeek: number, durMin: number, lastMonday = addDays(MONDAY, -7)): Activity[] =>
  [...Array(weeks * perWeek).keys()].map((i) => ({
    id: `a${i}`,
    start: `${addDays(lastMonday, -7 * Math.floor(i / perWeek) + (i % perWeek) * 2)}T08:00`,
    durMin,
    distM: durMin * 160,
  }));

const request = (extra: Partial<WeekRequest> = {}): WeekRequest => ({
  monday: MONDAY,
  now: `${addDays(MONDAY, -1)}T18:00`,
  goal: { distanceM: 21097.5, date: "2027-03-21" },
  settings: SETTINGS,
  history: runs(8, 4, 45),
  fitness: { vdot: 40 },
  cal: [LEGS],
  kept: [],
  ...extra,
});

const weekOf = (r: WeekRequest, sessions = planWeek(r).sessions) => ({
  monday: r.monday,
  sessions,
  cal: r.cal,
  settings: r.settings,
});

describe("planWeek (cycle 0.1 buildWeek)", () => {
  it("fills a plan week with as many runs as asked, placed without breaking a hard rule", () => {
    const r = request();
    const { sessions } = planWeek(r);
    expect(sessions).toHaveLength(4);
    expect(sessions.every((s) => s.start >= `${MONDAY}T00:00` && s.start < `${addDays(MONDAY, 7)}T00:00`)).toBe(true);
    expect(new Set(sessions.map((s) => s.id)).size).toBe(4);
    expect(validateWeek(weekOf(r, sessions)).ok).toBe(true);
  });

  it("never places a hard run within 24 h after the legs session (H5)", () => {
    const r = request();
    const legsEnd = LEGS.end;
    const hard = planWeek(r).sessions.filter(isHard);
    expect(hard.length).toBeGreaterThan(0);
    for (const s of hard)
      expect(s.start < LEGS.start || s.start >= addDays(dateOf(legsEnd), 1) + legsEnd.slice(10)).toBe(true);
  });

  it("fills the rest of the current week from now when the programme starts mid-week", () => {
    const now = `${addDays(MONDAY, 3)}T12:00`;
    const { sessions } = planWeek(request({ now, planStart: dateOf(now) }));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.start > now)).toBe(true);
  });

  it("keeps what Anna moved and drops its planned twin", () => {
    const moved = { ...easy("mine", `${addDays(MONDAY, 2)}T07:00`, 40), manual: true };
    const r = request({ kept: [moved] });
    const { sessions } = planWeek(r);
    expect(sessions).toContainEqual(moved);
    expect(sessions).toHaveLength(4);
    const others = sessions.filter((s) => s.id !== "mine");
    expect(others.every((s) => checkHard(s, slotOf(s), weekOf(r, sessions)).length === 0)).toBe(true);
  });

  it("lets a kept run with no twin of its type replace one as hard, else an easy one, never the long run (EV19, EV-19 to EV-21)", () => {
    const types = (r: WeekRequest) =>
      planWeek(r)
        .sessions.map((s) => s.type)
        .sort();
    const test = (monday: string) => ({
      ...hard("mine", `${addDays(monday, 3)}T07:00`, 30),
      type: "TEST" as const,
      manual: true,
    });
    const spe = (kept: WeekRequest["kept"]) =>
      request({ monday: "2027-02-08", now: "2027-02-07T18:00", planStart: addDays(MONDAY, -1), kept });

    expect(types(spe([]))).toEqual(["E", "L", "SPE", "T"]);
    expect(types(spe([test("2027-02-08")]))).toEqual(["E", "L", "T", "TEST"]);
    expect(types(request())).toEqual(["COTES_C", "E", "E", "L"]);
    expect(types(request({ kept: [test(MONDAY)] }))).toEqual(["COTES_C", "E", "L", "TEST"]);

    const fourQ = [0, 2, 4, 6].map((d) => ({ ...hard(`h${d}`, `${addDays(MONDAY, d)}T07:00`, 30), manual: true }));
    expect(types(request({ kept: fourQ }))).toEqual(["L", "T", "T", "T", "T"]);
  });

  it("plans maintenance without a goal: one Q, at most three runs (M9)", () => {
    const { sessions } = planWeek(request({ goal: null }));
    expect(sessions).toHaveLength(3);
    expect(sessions.filter(isHard)).toHaveLength(1);
  });

  it("plans a post-race week of easy runs right after the race (P23)", () => {
    const { sessions } = planWeek(request({ goal: { distanceM: 10000, date: addDays(MONDAY, -1) } }));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.type === "E")).toBe(true);
  });

  it("goes back to maintenance once the post-race week is over", () => {
    const { sessions } = planWeek(request({ goal: { distanceM: 10000, date: addDays(MONDAY, -14) } }));
    expect(sessions.filter(isHard)).toHaveLength(1);
  });

  it("shortens the easy runs when the last week run was much smaller (G2)", () => {
    const total = (history: Activity[]) =>
      planWeek(request({ history, goal: null })).sessions.reduce((sum, s) => sum + s.durMin, 0);
    const steady = runs(4, 4, 45);
    const dropped = [...runs(3, 4, 45, addDays(MONDAY, -14)), ...runs(1, 2, 30)];
    expect(total(dropped)).toBeLessThan(total(steady));
  });

  it("aims SPE at the target race pace and plans from the declared start without history", () => {
    const r = request({ history: [], goal: { distanceM: 21097.5, date: "2027-03-21", targetMin: 110 } });
    expect(planWeek(r).sessions.length).toBeGreaterThan(0);
  });
});

describe("programPlan", () => {
  it("counts its weeks from the Monday after the start, whatever the day it is now", () => {
    const goal = { distanceM: 21097.5, date: "2027-03-21" } as const;
    const started = programPlan({ ...request({ planStart: addDays(MONDAY, -10) }), goal });
    const later = programPlan({
      ...request({ planStart: addDays(MONDAY, -10), now: `${addDays(MONDAY, 20)}T08:00` }),
      goal,
    });
    expect(started.weeks[0]?.monday).toBe(addDays(MONDAY, -7));
    expect(later.split).toEqual(started.split);
    expect(started.weeks).toHaveLength(
      started.split.base + started.split.dev + started.split.spe + started.split.taper,
    );
  });

  it("leaves out the runs after the start, as the weeks it fills do", () => {
    const goal = { distanceM: 21097.5, date: "2027-03-21" } as const;
    const after = runs(4, 4, 90, addDays(MONDAY, 21));
    const base = request({ planStart: dateOf(addDays(MONDAY, -1)) });
    expect(programPlan({ ...base, history: [...base.history, ...after], goal }).v0).toBe(
      programPlan({ ...base, goal }).v0,
    );
  });
});
