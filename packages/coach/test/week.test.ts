import { describe, expect, it } from "vitest";
import type { Activity, WeekRequest } from "../src/index.ts";
import {
  addDays,
  checkHard,
  dateOf,
  isHard,
  moveSession,
  paces,
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

/** Audit of 26/11/2026: 8 weeks of `perWeek` runs of 30 min, the last one ending with a 50 min long run. */
const marathonHistory = (perWeek: number): Activity[] =>
  [1, 2, 3, 4, 5, 6, 7, 8].flatMap((k) =>
    (k === 1 ? [20, 20, 50].slice(3 - perWeek) : Array<number>(perWeek).fill(30)).map((durMin, i) => ({
      id: `w${k}-${i}`,
      start: `${addDays(MONDAY, -7 * k + 2 * i + 1)}T08:00`,
      durMin,
      distM: durMin * 160,
    })),
  );

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

  it("places nothing new today when a week under way is rebuilt, whatever rebuilt it (P25, P-27)", () => {
    // A settings change on Wednesday morning, the programme started weeks ago: today stays as it was.
    const now = `${addDays(MONDAY, 2)}T07:00`;
    const { sessions } = planWeek(request({ now, planStart: addDays(MONDAY, -21) }));
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => dateOf(s.start) > dateOf(now))).toBe(true);
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

    expect(types(spe([]))).toEqual(["E", "I", "L", "SPE"]);
    expect(types(spe([test("2027-02-08")]))).toEqual(["E", "I", "L", "TEST"]);
    expect(types(request())).toEqual(["E", "E", "E", "L"]);
    expect(types(request({ kept: [test(MONDAY)] }))).toEqual(["E", "E", "L", "TEST"]);

    const fourQ = [0, 2, 4, 6].map((d) => ({ ...hard(`h${d}`, `${addDays(MONDAY, d)}T07:00`, 30), manual: true }));
    expect(types(request({ kept: fourQ }))).toEqual(["L", "T", "T", "T", "T"]);
  });

  it("keeps one footing with sprints when the one she ran is kept in a rebuilt week (EV-33, P12)", () => {
    // Parcours F6: Monday's sprints, run, then 5 runs and back to 4 on Tuesday: Wednesday had sprints too.
    const kinds = (s: { steps: { kind: string }[] }) => s.steps.map((st) => st.kind).join();
    const sprintRun = planWeek(request()).sessions.find((s) => kinds(s).includes("recover"));
    if (!sprintRun) throw new Error("a footing with sprints expected (P-14)");
    const done = { ...sprintRun, start: `${MONDAY}T07:00`, status: "done" as const };
    const now = `${addDays(MONDAY, 1)}T08:00`;
    const { sessions } = planWeek(request({ now, planStart: addDays(MONDAY, -21), kept: [done] }));
    expect(sessions.filter((s) => kinds(s).includes("recover"))).toHaveLength(1);
    expect(sessions.some((s) => kinds(s) === "work,strides")).toBe(true);
  });

  it("builds a week during a cold already shortened, and one after it without Q for 3 days (EV-10, EV-31)", () => {
    const spe = (health: WeekRequest["health"]) =>
      planWeek(request({ monday: "2027-02-08", now: "2027-02-07T18:00", planStart: addDays(MONDAY, -1), health }));
    const usual = spe(undefined).sessions;
    const cold = spe({ kind: "cold", since: "2027-02-06" }).sessions;
    const minutes = (xs: { durMin: number }[]) => xs.reduce((sum, s) => sum + s.durMin, 0);
    expect(cold.filter((s) => s.type !== "E" && s.type !== "RECUP")).toEqual([]);
    expect(minutes(cold)).toBeLessThanOrEqual(0.6 * minutes(usual));
    const after = spe({ kind: "easy", easyUntil: "2027-02-11" }).sessions;
    expect(after.filter((s) => s.start < "2027-02-11" && isHard(s) && s.type !== "L")).toEqual([]);
    expect(after.some((s) => s.start >= "2027-02-11" && isHard(s) && s.type !== "L")).toBe(true);
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

  it("goes back to maintenance once the two post-race weeks are over (MA6)", () => {
    const { sessions } = planWeek(request({ goal: { distanceM: 10000, date: addDays(MONDAY, -15) } }));
    expect(sessions.filter(isHard)).toHaveLength(1);
  });

  const total = (r: WeekRequest): number => planWeek(r).sessions.reduce((sum, s) => sum + s.durMin, 0);
  const planStart = addDays(MONDAY, -35);

  it("returns to the plan after one short week, and caps it on a lower chronic load (G2, W-1)", () => {
    const steady = runs(8, 4, 45);
    const oneShort = [...runs(7, 4, 45, addDays(MONDAY, -14)), ...runs(1, 2, 30)];
    const lowered = [...runs(4, 4, 45, addDays(MONDAY, -35)), ...runs(4, 2, 45)];
    const loweredRegular = [...runs(8, 4, 45, addDays(MONDAY, -42)), ...runs(4, 2, 45)];
    expect(total(request({ planStart, history: oneShort }))).toBe(total(request({ planStart, history: steady })));
    expect(total(request({ planStart, history: lowered }))).toBeLessThanOrEqual(1.1 * 90 + 1 + 45 - 20);
    // G2b: a regular runner (P6) keeps her 45-min long run, G2 exceeded by 10 % of its cap at most.
    expect(planWeek(request({ planStart, history: loweredRegular })).sessions.find((s) => s.type === "L")?.durMin).toBe(
      45,
    );
  });

  it("counts the runs already in a week rebuilt mid-week under its G2 cap (G2, W-9)", () => {
    // Jumeau, graine 28 : 5 courses au lieu de 4 un mercredi soir, deux footings déjà courus.
    const now = `${addDays(MONDAY, 2)}T20:15`;
    const kept = [
      easy("d1", `${MONDAY}T18:00`, 30, { status: "done" }),
      easy("d2", `${addDays(MONDAY, 1)}T18:00`, 30, { status: "done" }),
    ];
    const settings = { ...SETTINGS, runsPerWeek: 5 as const };
    const r = request({ now, planStart: addDays(MONDAY, -21), history: runs(8, 3, 40), kept, settings });
    const minutes = planWeek(r).sessions.reduce((sum, s) => sum + s.durMin, 0);
    expect(minutes).toBeLessThanOrEqual(1.1 * 1.1 * 120 + 1);
  });

  it("keeps the run she asked for on top of her week: the rebuilt week still has all its own (RQ2, W-10)", () => {
    // Jumeau, graine 39 : la reconstruction du dimanche retirait une séance pour la course qu'elle avait ajoutée.
    const extra = { ...easy(`${MONDAY}-r0`, `${addDays(MONDAY, 3)}T07:00`, 40), manual: true };
    const { sessions } = planWeek(request({ kept: [extra] }));
    expect(sessions).toHaveLength(5);
    expect(sessions).toContainEqual(extra);
  });

  it("keeps her 50-min long run after a marathon instead of its 39.6-min share when G2 binds (P14, G2b, W-8)", () => {
    // Audit of 26/11/2026: V0 90 (her 4 weeks before), 3 runs a week, 50 min her longest of 30 days.
    const history = marathonHistory(3);
    const { sessions } = planWeek(
      request({
        goal: { distanceM: 21097.5, date: "2027-04-04" },
        settings: { ...SETTINGS, runsPerWeek: 3 },
        history,
        fitness: { vdot: 39 },
      }),
    );
    expect(sessions.map((s) => [s.type, s.durMin])).toEqual([
      ["L", 50],
      ["E", 29.5],
      ["E", 30],
    ]);
  });

  it("does not keep the long run of a runner under 3 runs a week: a beginner's chronic load must not ratchet (P6, G2b)", () => {
    const { sessions } = planWeek(
      request({
        goal: { distanceM: 21097.5, date: "2027-04-04" },
        settings: { ...SETTINGS, runsPerWeek: 3 },
        history: marathonHistory(2),
        fitness: { vdot: 39 },
      }),
    );
    expect(sessions.find((s) => s.type === "L")?.durMin).toBeLessThan(45);
  });

  it("places a test in programme weeks 2 to 4 while the level is provisional (F10, W-2)", () => {
    const types = (monday: string, provisional: boolean) =>
      planWeek(
        request({
          monday,
          now: `${addDays(monday, -1)}T18:00`,
          planStart: addDays(MONDAY, -1),
          fitness: { vdot: 40, provisional },
        }),
      ).sessions.map((s) => s.type);
    expect(types(addDays(MONDAY, 7), true)).toContain("TEST");
    expect(types(addDays(MONDAY, 7), false)).not.toContain("TEST");
    expect(types(MONDAY, true)).not.toContain("TEST");
    expect(types(addDays(MONDAY, 28), true)).not.toContain("TEST");
  });

  it("tests a level unmeasured for 6 weeks, never as the first hard run, alone in a deload, outside the taper (P26, W-6)", () => {
    const planStart = addDays(MONDAY, -1);
    // Her first interval session of the programme, run.
    const ran: Activity = { id: "q", start: `${addDays(MONDAY, 2)}T07:00`, durMin: 45, distM: 9000, plannedType: "I" };
    const types = (monday: string, fitness: WeekRequest["fitness"], history = [...runs(8, 4, 45), ran]) =>
      planWeek(request({ monday, now: `${addDays(monday, -1)}T18:00`, planStart, fitness, history })).sessions.map(
        (s) => s.type,
      );
    const monday = addDays(MONDAY, 14);
    expect(types(monday, { vdot: 40, measuredOn: addDays(monday, -36) })).toContain("TEST");
    expect(types(monday, { vdot: 40, measuredOn: addDays(monday, -35) })).not.toContain("TEST");
    expect(types(monday, { vdot: 40, measuredOn: addDays(monday, -36) }, runs(8, 4, 45))).not.toContain("TEST");
    expect(types(monday, { vdot: 40 })).not.toContain("TEST");
    // A test or a race she ran measures her too.
    const tested: Activity = { id: "t", start: `${addDays(monday, -10)}T08:00`, durMin: 35, distM: 7000, isTest: true };
    const measured = { vdot: 40, measuredOn: addDays(monday, -60) };
    expect(types(monday, measured, [...runs(8, 4, 45), ran, tested])).not.toContain("TEST");
    // The 4th week is a deload (P9): the test is its one hard run.
    const deload = types(addDays(MONDAY, 21), { vdot: 40, measuredOn: addDays(MONDAY, -40) });
    expect(deload).toContain("TEST");
    expect(deload.filter((t) => ["T", "CRUISE", "I", "SPE"].includes(t))).toEqual([]);
    const race = request({
      monday: "2027-03-15",
      now: "2027-03-14T18:00",
      planStart: addDays(MONDAY, -1),
      fitness: { vdot: 40, measuredOn: "2027-01-01" },
    });
    expect(planWeek(race).sessions.map((s) => s.type)).not.toContain("TEST");
  });

  it("turns the week after three days of confirmed fatigue into a deload (P9, W-3)", () => {
    const day = (k: number, tired: boolean) => ({
      date: addDays(MONDAY, k),
      rhr: tired ? 60 : 52 + (k % 2),
      sleepMin: tired ? 330 : 450 + 10 * (k % 3),
      bodyBatteryWake: 70,
      stressAvg: 30,
    });
    const signals = (tired: boolean) => [...Array(35).keys()].map((k) => day(k - 35, tired && k >= 28 && k <= 32));
    const plain = total(request({ planStart }));
    expect(total(request({ planStart, signals: signals(true) }))).toBeLessThan(0.85 * plain);
    expect(total(request({ planStart, signals: signals(false) }))).toBe(plain);
  });

  it("builds a return week while she recovers from a fever: G7 at 85 % at least (EV9, W-4)", () => {
    const plain = total(request({ planStart }));
    const health = { kind: "recovering" as const, easyUntil: MONDAY, qEasierUntil: addDays(MONDAY, 7) };
    expect(total(request({ planStart, health }))).toBeLessThanOrEqual(Math.ceil(0.85 * plain));
    const over = { ...health, easyUntil: addDays(MONDAY, -7) };
    expect(total(request({ planStart, health: over }))).toBe(plain);
  });

  it("after a race, lets the long run take its share, not 1.10 × her short footings since (P14, G1, W-7)", () => {
    // 120 min long runs 7 to 12 weeks back, a race 6 weeks back, then 4 footings of 40 min a week.
    const block = [...Array(6).keys()].flatMap((k): Activity[] => {
      const m = addDays(MONDAY, -7 * (12 - k));
      return [1, 3, 4]
        .map((d) => ({ id: `b${k}${d}`, start: `${addDays(m, d)}T08:00`, durMin: 45, distM: 7200 }))
        .concat({
          id: `b${k}L`,
          start: `${addDays(m, 6)}T08:00`,
          durMin: 120,
          distM: 19200,
        });
    });
    const race: Activity = {
      id: "race",
      start: `${addDays(MONDAY, -36)}T09:00`,
      durMin: 100,
      distM: 21097.5,
      isRace: true,
    };
    const footings = runs(5, 4, 40);
    const long = (isRace: boolean) =>
      planWeek(request({ history: [...block, { ...race, isRace }, ...footings] })).sessions.find((x) => x.type === "L")
        ?.durMin ?? 0;
    expect(long(false)).toBeLessThanOrEqual(44);
    expect(long(true)).toBeGreaterThan(50);
  });

  it("keeps one short race-pace Q in the race week (P18, W-5)", () => {
    const goal = { distanceM: 10000 as const, date: addDays(MONDAY, 6), targetMin: 50 };
    const { sessions } = planWeek(request({ goal, planStart: addDays(MONDAY, -60) }));
    const qs = sessions.filter((s) => isHard(s) && s.type !== "RACE");
    expect(qs).toHaveLength(1);
    expect(qs[0]?.steps.find((st) => st.kind === "work")).toMatchObject({ reps: 2, distM: 1000 });
  });

  it("never aims a half's race pace faster than her T pace of the week (P21, P-32)", () => {
    const spe = (targetMin: number, vdot: number) =>
      planWeek(
        request({
          monday: "2027-02-08",
          now: "2027-02-07T18:00",
          planStart: addDays(MONDAY, -1),
          goal: { distanceM: 21097.5, date: "2027-03-21", targetMin },
          fitness: { vdot },
        }),
      )
        .sessions.flatMap((s) => s.steps)
        .find((st) => st.zone === "race")?.target.paceSKm?.[0];
    // 1:48 is 5:07 /km; VDOT 39 holds T at 5:12, VDOT 42 at 4:55.
    expect(spe(108, 39)).toBeCloseTo(paces(39).T, 6);
    expect(spe(108, 42)).toBeCloseTo((108 * 60) / 21.0975, 6);
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
