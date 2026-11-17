import { describe, expect, it } from "vitest";
import type { Activity, WeekRequest } from "../src/index.ts";
import {
  addDays,
  checkHard,
  dateOf,
  isHard,
  moveSession,
  planWeek,
  programPlan,
  slotAt,
  slotOf,
  validateWeek,
} from "../src/index.ts";
import { block, easy, hard, LEGS, MONDAY, SETTINGS, state } from "./fixtures.ts";

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

  it("starts a programme the day after: nothing today, every run asked for, the long run on Sunday (P25, PL-13)", () => {
    // Onboarding on a Tuesday at 8:00, a student's week: classes until 16:30, her runs from 17:00, four a week.
    const now = `${addDays(MONDAY, 1)}T08:00`;
    const classes = [0, 1, 2, 3, 4].map((i) =>
      block(`c${i}`, `${addDays(MONDAY, i)}T08:00`, `${addDays(MONDAY, i)}T16:30`, "class"),
    );
    const settings = { ...SETTINGS, runsPerWeek: 4 as const, earliest: "17:00", latestEnd: "21:30" };
    const { sessions } = planWeek(
      request({ now, planStart: dateOf(now), settings, cal: [...classes, LEGS], history: [] }),
    );
    expect(sessions).toHaveLength(4);
    expect(sessions.every((s) => dateOf(s.start) > dateOf(now))).toBe(true);
    expect(sessions.find((s) => s.type === "L")?.start.slice(0, 10)).toBe(addDays(MONDAY, 6));
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

describe("race week (P24, H12)", () => {
  const SUNDAY = addDays(MONDAY, 6);
  const tenK = (date: string) => ({ distanceM: 10000 as const, date });
  const raceWeek = (extra: Partial<WeekRequest>) => planWeek(request(extra)).sessions;
  type Sessions = ReturnType<typeof raceWeek>;
  const others = (sessions: Sessions) => sessions.filter((s) => s.type !== "RACE");
  const races = (sessions: Sessions) => sessions.filter((s) => s.type === "RACE");

  it("puts the race on its date in place of the long run, the last Q at J-4 at the latest (P-17)", () => {
    const now = `${addDays(MONDAY, 1)}T12:00`;
    const sessions = raceWeek({ now, planStart: dateOf(now), goal: tenK(SUNDAY) });
    // No start time given: the default morning start.
    expect(races(sessions).map((s) => s.start)).toEqual([`${SUNDAY}T09:00`]);
    expect(races(sessions)[0]?.frozen).toBe(true);
    expect(sessions.some((s) => s.type === "L")).toBe(false);
    expect(sessions).toHaveLength(4);
    expect(sessions.every((s) => s.start > now)).toBe(true);
    for (const s of others(sessions).filter(isHard)) expect(dateOf(s.start) <= addDays(SUNDAY, -4)).toBe(true);
  });

  it("turns the Q into easy runs when no day is left for them, before and after the race (P-18)", () => {
    const wednesday = addDays(MONDAY, 2);
    const sessions = raceWeek({ now: `${MONDAY}T06:00`, planStart: MONDAY, goal: tenK(wednesday) });
    expect(races(sessions).map((s) => dateOf(s.start))).toEqual([wednesday]);
    expect(others(sessions).length).toBeGreaterThan(0);
    expect(others(sessions).every((s) => !isHard(s) && dateOf(s.start) !== wednesday)).toBe(true);
  });

  it("keeps the last three days before a race early next week free of hard runs (P-19)", () => {
    const tuesday = addDays(MONDAY, 8);
    const goal = tenK(tuesday);
    const current = raceWeek({ planStart: addDays(MONDAY, -1), goal });
    expect(races(current)).toHaveLength(0);
    expect(current.filter(isHard).every((s) => dateOf(s.start) < addDays(tuesday, -3))).toBe(true);
    const next = raceWeek({ monday: addDays(MONDAY, 7), planStart: addDays(MONDAY, -1), goal, cal: [] });
    expect(races(next).map((s) => dateOf(s.start))).toEqual([tuesday]);
    expect(others(next).some(isHard)).toBe(false);
  });

  it("makes the plan's last taper week a race week too (P-20)", () => {
    const sessions = raceWeek({
      monday: "2027-03-15",
      now: "2027-03-14T18:00",
      planStart: addDays(MONDAY, -1),
      cal: [],
    });
    expect(races(sessions).map((s) => dateOf(s.start))).toEqual(["2027-03-21"]);
    expect(sessions.some((s) => s.type === "L")).toBe(false);
    for (const s of others(sessions).filter(isHard)) expect(dateOf(s.start) <= "2027-03-17").toBe(true);
  });

  it("places the race at its start time, whatever her calendar or days without runs say (P-21)", () => {
    const now = `${addDays(MONDAY, 1)}T12:00`;
    const sessions = raceWeek({
      now,
      planStart: dateOf(now),
      goal: { ...tenK(SUNDAY), startTime: "10:30" },
      settings: { ...SETTINGS, noRunDays: [6] },
      cal: [LEGS, block("class", `${SUNDAY}T07:00`, `${SUNDAY}T12:00`, "class")],
    });
    expect(races(sessions).map((s) => s.start)).toEqual([`${SUNDAY}T10:30`]);
  });

  it("keeps what Anna moved and drops the race of an old date (EV-23)", () => {
    const now = `${addDays(MONDAY, 1)}T12:00`;
    const mine = { ...hard("mine", `${addDays(SUNDAY, -2)}T07:00`, 40), manual: true };
    const old = { ...hard("old", `${addDays(SUNDAY, -1)}T09:00`, 50), type: "RACE" as const, frozen: true };
    const sessions = raceWeek({ now, planStart: dateOf(now), goal: tenK(SUNDAY), kept: [mine, old] });
    expect(sessions.find((s) => s.id === "mine")).toEqual(mine);
    expect(sessions.some((s) => s.id === "old")).toBe(false);
    expect(races(sessions).map((s) => dateOf(s.start))).toEqual([SUNDAY]);
  });

  it("bars hard runs from J-3 to the week after the race; Anna may force one, as an easy run (H12, PL-12)", () => {
    const race = { ...hard("race", `${SUNDAY}T09:00`, 50), type: "RACE" as const };
    const w = { monday: MONDAY, sessions: [race], cal: [], settings: SETTINGS };
    const friday = `${addDays(SUNDAY, -2)}T18:00`;
    const wednesday = `${addDays(MONDAY, 2)}T18:00`;
    const q = hard("q", wednesday);
    expect(checkHard(q, slotAt(q, friday), w).map((v) => v.ruleId)).toEqual(["H12"]);
    expect(checkHard(easy("e", friday), slotAt(q, friday), w)).toEqual([]);
    expect(checkHard(q, slotOf(q), w)).toEqual([]);

    const r = moveSession(state([race, q], []), "q", slotAt(q, friday), `${MONDAY}T08:00`);
    expect(r.state.sessions.find((s) => s.id === "q")).toMatchObject({ type: "E", start: friday, manual: true });
    expect(r.warnings.map((x) => x.ruleId)).toEqual(["H12"]);
  });
});
