import { describe, expect, it } from "vitest";
import type { Activity, ReviewInput, ReviewRun, Session } from "../src/index.ts";
import {
  addDays,
  isGoalRace,
  isHard,
  lastRace,
  planWeek,
  postRaceIndex,
  postRaceWeek,
  previousRace,
  raceReport,
  raceSplits,
  weekReview,
} from "../src/index.ts";
import { easy, hard, long, MONDAY, P40, SETTINGS } from "./fixtures.ts";

const done = { status: "done" as const };
const at = (day: number, time = "18:00") => `${addDays(MONDAY, day)}T${time}`;
const run = (id: string, start: string, durMin: number, distM: number, extra: Partial<ReviewRun> = {}): ReviewRun => ({
  id,
  start,
  durMin,
  distM,
  ...extra,
});
const earlier = (n: number, distM = 8000): Activity[] =>
  [...Array(n).keys()].map((i) => run(`b${i}`, at(-3 - i * 4, "08:00"), 45, distM));
/** 1 km laps at `pace` s/km. */
const laps = (n: number, pace: number) => [...Array(n).keys()].map(() => ({ durMin: pace / 60, distM: 1000 }));

const input = (extra: Partial<ReviewInput> = {}): ReviewInput => ({
  sessions: [easy("e1", at(1), 45, done), hard("q", at(3), 60, done), long("l", at(6, "09:30"), 90, done)],
  runs: [run("r1", at(1), 45, 7000, { sessionId: "e1" }), run("r2", at(3), 60, 10000, { sessionId: "q" })],
  before: earlier(10),
  exams: 0,
  next: [easy("n1", at(8), 45), hard("n2", at(10), 60), long("n3", at(13, "09:30"), 90)],
  ...extra,
});

describe("le bilan du dimanche (BR)", () => {
  it("counts the runs done against those planned, cancelled ones aside, and the minutes run (BR1, BR2)", () => {
    const r = weekReview(
      input({
        sessions: [
          easy("e1", at(1), 45, done),
          hard("q", at(3), 60, { status: "skipped" }),
          easy("x", at(4), 30, { status: "cancelled" }),
        ],
        runs: [run("r1", at(1), 44.6, 7000, { sessionId: "e1" }), run("r2", at(5), 31, 5000)],
      }),
    );
    expect([r.done, r.planned, r.minutes]).toEqual([1, 2, 76]);
  });

  it("names a quality session run faster than its target from its work laps (BR3)", () => {
    const quick = run("r2", at(3), 60, 12000, { sessionId: "q", laps: [...laps(2, 420), ...laps(8, P40.T - 12)] });
    const r = weekReview(input({ runs: [quick] }));
    expect(r.highlight).toEqual({ text: "Ton seuil de jeudi, plus rapide que prévu", type: "T" });
  });

  it("keeps quiet on a quality session run on target, and never praises a fast easy run (BR3)", () => {
    const onTarget = run("r2", at(3), 60, 12000, { sessionId: "q", laps: laps(10, P40.T) });
    const fastEasy = run("r1", at(1), 45, 9000, { sessionId: "e1", laps: laps(9, P40.T) });
    expect(weekReview(input({ runs: [onTarget, fastEasy], before: [] })).highlight).toBeUndefined();
  });

  it("names her longest run in two months, only with enough runs to compare (BR4)", () => {
    const longest = run("r3", at(6, "09:30"), 95, 16100, { sessionId: "l" });
    expect(weekReview(input({ runs: [longest] })).highlight).toEqual({
      text: "16,1 km dimanche, ta plus longue course depuis deux mois",
      type: "L",
    });
    expect(weekReview(input({ runs: [longest], before: earlier(5) })).highlight).toBeUndefined();
    expect(weekReview(input({ runs: [longest], before: earlier(10, 16100) })).highlight).toBeUndefined();
  });

  it("says the week in one sentence, then how the next one compares (BR5, BR6)", () => {
    expect(weekReview(input()).reggie).toBe(
      "Tu as fait toutes tes courses. La semaine prochaine garde le même volume.",
    );
    expect(weekReview(input({ exams: 2 })).reggie).toMatch(/^Tu as tout tenu malgré tes examens\./);
    const more = [...input().next, easy("n4", at(11), 45)];
    expect(weekReview(input({ next: more })).reggie).toMatch(/monte un peu, avec une course de plus\.$/);
    const longer = input().next.map((s) => ({ ...s, durMin: s.durMin * 1.2 }));
    expect(weekReview(input({ next: longer })).reggie).toMatch(/monte un peu, sans course de plus\.$/);
    expect(weekReview(input({ next: input().next.slice(0, 1) })).reggie).toMatch(
      /plus légère, avec 2 courses de moins\.$/,
    );
    const race = [{ ...hard("race", at(13, "09:00")), type: "RACE" as const }];
    expect(weekReview(input({ next: race })).reggie).toMatch(/c'est ta course\.$/);
    expect(weekReview(input({ next: [] })).reggie).toBe("Tu as fait toutes tes courses.");
  });

  it("read on Monday, speaks of last week and of this one (BR7, audit N-F2)", () => {
    const quick = run("r2", at(3), 60, 12000, { sessionId: "q", laps: [...laps(2, 420), ...laps(8, P40.T - 12)] });
    const r = weekReview(input({ runs: [quick], monday: true }));
    expect(r.highlight?.text).toBe("Ton seuil de jeudi dernier, plus rapide que prévu");
    expect(weekReview(input({ monday: true })).reggie).toBe(
      "Tu as fait toutes tes courses. Cette semaine garde le même volume.",
    );
    const race = [{ ...hard("race", at(13, "09:00")), type: "RACE" as const }];
    expect(weekReview(input({ next: race, monday: true })).reggie).toMatch(/Cette semaine, c'est ta course\.$/);
  });

  it("never makes up for a missed run in its words (BR5)", () => {
    const missed = (n: number) => input().sessions.map((s, i) => (i < n ? { ...s, status: "skipped" as const } : s));
    expect(weekReview(input({ sessions: missed(1) })).reggie).toMatch(/^Une seule course manquée/);
    expect(weekReview(input({ sessions: missed(2) })).reggie).toMatch(/^Tu repars de là, sans rattraper/);
    expect(weekReview(input({ sessions: missed(3) })).reggie).toMatch(/^Pas de course cette semaine/);
  });

  it("never says she did all her runs when none was planned (BR5)", () => {
    // Audit parcours réel B1: « 0 sur 0 course… Tu as fait toutes tes courses » for the week before the app.
    expect(weekReview(input({ sessions: [], next: [] })).reggie).toBe("");
  });
});

const SEMI = { distanceM: 21097.5 as const, date: addDays(MONDAY, 6), targetMin: 108 };
const race = (durMin: number, extra: Partial<Activity> = {}): Activity => ({
  id: "race",
  start: `${SEMI.date}T09:02`,
  durMin,
  distM: 21240,
  ...extra,
});

describe("après la course objectif (RR)", () => {
  it("takes a run on race day over about the race distance as the race (RR1)", () => {
    expect(isGoalRace(SEMI, race(107.5))).toBe(true);
    expect(isGoalRace(SEMI, race(25, { distM: 4000 }))).toBe(false);
    expect(isGoalRace(SEMI, race(107.5, { start: `${addDays(SEMI.date, -1)}T09:02` }))).toBe(false);
  });

  it("gives the gap to her target, under or over (RR2)", () => {
    expect(raceReport(SEMI, race(107.53)).gapMin).toBeCloseTo(-0.47);
    expect(raceReport(SEMI, race(109.17)).gapMin).toBeCloseTo(1.17);
    expect(raceReport({ ...SEMI, targetMin: undefined }, race(109)).gapMin).toBeUndefined();
  });

  it("compares with her last race at the distance, else her declared time (RR3)", () => {
    const old = race(112, { id: "old", start: "2026-06-14T09:00", isRace: true });
    const ten = race(52, { id: "ten", start: "2026-09-20T09:00", distM: 10000, isRace: true });
    const declared = { distanceM: 21097.5, minutes: 113, date: "2025-12-07" };
    expect(previousRace(SEMI, [old, ten], declared)).toEqual({ timeMin: 112, date: "2026-06-14" });
    expect(previousRace(SEMI, [ten], declared)).toEqual({ timeMin: 113, date: "2025-12-07" });
    expect(previousRace(SEMI, [ten], { distanceM: 10000, minutes: 50 })).toBeUndefined();
  });

  it("splits a half by 5 km, the last bit apart, and a 5 km tail past the line with its split (RR4)", () => {
    const semi = race(107.5, { laps: [...laps(21, 306), { durMin: 0.5, distM: 97.5 }] });
    expect(raceSplits(semi, 21097.5).map((s) => s.toKm)).toEqual([5, 10, 15, 20, 21.1]);
    const five = race(25, { distM: 5050, laps: [...laps(5, 300), { durMin: 0.25, distM: 50 }] });
    expect(raceSplits(five, 5000).map((s) => s.toKm)).toEqual([1, 2, 3, 4, 5.1]);
    expect(raceSplits(race(107.5), 21097.5)).toEqual([]);
  });

  it("says a negative split, an even race and a fast finish (RR5)", () => {
    const negative = race(107, { laps: [...laps(10, 310), ...laps(10, 300), ...laps(1, 290)] });
    expect(raceReport(SEMI, negative).reggie).toBe(
      "Plus rapide sur la deuxième moitié que sur la première. Ta fin a été ta portion la plus rapide. Bravo Anna. Repose-toi bien cette semaine.",
    );
    expect(raceReport(SEMI, race(107, { laps: laps(21, 305) })).reggie).toMatch(/^Une allure régulière/);
    expect(raceReport(SEMI, race(107)).reggie).toBe("Bravo Anna. Repose-toi bien cette semaine.");
  });
});

describe("après la course : les semaines faciles selon la distance (MA6)", () => {
  const minutes = (w: { durMin: number }[]) => w.map((x) => x.durMin);
  const strides = (w: Session[]) => w.filter((x) => x.steps.some((st) => st.kind === "strides")).length;

  it("gives one week at 75 % after a 10 km, with strides (MA-5)", () => {
    const w = postRaceWeek(180, P40, 10000, 1);
    // The strides come on top of the footing (+2 min), as in every footing with strides.
    expect(minutes(w)).toEqual([47, 45, 45]);
    expect(w.every((s) => s.type === "E")).toBe(true);
    expect(strides(w)).toBe(1);
  });

  it("gives two weeks at 50 % then 75 % after a half, strides in the second only (MA-8)", () => {
    expect(minutes(postRaceWeek(180, P40, 21097.5, 1))).toEqual([30, 30, 30]);
    expect(minutes(postRaceWeek(180, P40, 21097.5, 2))).toEqual([47, 45, 45]);
    expect(strides(postRaceWeek(180, P40, 21097.5, 1))).toBe(0);
    expect(strides(postRaceWeek(180, P40, 21097.5, 2))).toBe(1);
  });

  it("gives three weeks after a marathon, two runs the first, strides in the third (MA-11)", () => {
    expect(minutes(postRaceWeek(240, P40, 42195, 1))).toEqual([42, 42]);
    expect(minutes(postRaceWeek(240, P40, 42195, 2))).toEqual([48, 48, 48]);
    expect(minutes(postRaceWeek(240, P40, 42195, 3))).toEqual([66, 64, 64]);
    expect([1, 2, 3].map((k) => strides(postRaceWeek(240, P40, 42195, k)))).toEqual([0, 0, 1]);
  });

  it("counts the weeks from the goal's date, or from the race she ran once the goal is gone (MA-9)", () => {
    expect(lastRace({ distanceM: 10000, date: "2026-11-22" }, [], MONDAY)).toEqual({ day: "2026-11-22", distM: 10000 });
    const ran = [race(50, { start: "2026-11-15T09:00", isRace: true }), race(30, { start: "2026-11-18T09:00" })];
    expect(lastRace(null, ran, MONDAY)).toEqual({ day: "2026-11-15", distM: 21240 });
    expect(lastRace(null, [], MONDAY)).toBeUndefined();
    const index = (distM: number, days: number[]) =>
      days.map((d) => postRaceIndex({ day: addDays(MONDAY, -d), distM }, MONDAY));
    expect(index(21097.5, [1, 7, 8, 14, 15, 0])).toEqual([1, 1, 2, 2, null, null]);
    expect(index(10000, [1, 7, 8])).toEqual([1, 1, null]);
    expect(index(42195, [14, 15, 21, 22])).toEqual([2, 3, 3, null]);
  });

  const build = (history: Activity[], goal: Parameters<typeof planWeek>[0]["goal"] = null, monday = MONDAY) =>
    planWeek({
      monday,
      now: `${addDays(monday, -1)}T18:00`,
      goal,
      ...(goal ? { planStart: addDays(MONDAY, -1) } : {}),
      settings: SETTINGS,
      history,
      fitness: { vdot: 40 },
      cal: [],
      kept: [],
    });
  const ranOn = (daysBefore: number, distM: number) =>
    race(distM / 200, { start: `${addDays(MONDAY, -daysBefore)}T09:00`, distM, isRace: true });

  it("plans footings only after a half, even once she chose to keep fit; maintenance after a 10 km's week (MA-10)", () => {
    const half = build([ranOn(8, 21240)]);
    expect(half.sessions.length).toBe(3);
    expect(half.sessions.every((s) => s.type === "E")).toBe(true);
    expect(build([ranOn(8, 10000)]).sessions.some(isHard)).toBe(true);
  });

  it("keeps the days right after the race free: two after a half, three after a marathon (MA-12)", () => {
    const days = (w: { sessions: Session[] }) => w.sessions.map((s) => s.start.slice(0, 10));
    expect(days(build([ranOn(1, 21240)])).filter((d) => d <= addDays(MONDAY, 1))).toEqual([]);
    const full = build([ranOn(1, 42195)]);
    expect(full.sessions.length).toBe(2);
    expect(days(full).filter((d) => d <= addDays(MONDAY, 2))).toEqual([]);
  });

  it("starts a new plan with the easy weeks, never a quality run nor a long run in them (MA-13)", () => {
    const next = { distanceM: 10000 as const, date: addDays(MONDAY, 70) };
    const history = [ranOn(1, 21240)];
    for (const monday of [MONDAY, addDays(MONDAY, 7)]) {
      const w = build(history, next, monday);
      expect(w.sessions.length).toBe(3);
      expect(w.sessions.every((s) => s.type === "E")).toBe(true);
    }
    expect(build(history, next, addDays(MONDAY, 14)).sessions.length).toBe(SETTINGS.runsPerWeek);
  });
});
