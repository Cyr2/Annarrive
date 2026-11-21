import { describe, expect, it } from "vitest";
import type { Activity, ReviewInput, ReviewRun } from "../src/index.ts";
import {
  addDays,
  isGoalRace,
  lastRaceDay,
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

  it("never makes up for a missed run in its words (BR5)", () => {
    const missed = (n: number) => input().sessions.map((s, i) => (i < n ? { ...s, status: "skipped" as const } : s));
    expect(weekReview(input({ sessions: missed(1) })).reggie).toMatch(/^Une seule course manquée/);
    expect(weekReview(input({ sessions: missed(2) })).reggie).toMatch(/^Tu repars de là, sans rattraper/);
    expect(weekReview(input({ sessions: missed(3) })).reggie).toMatch(/^Pas de course cette semaine/);
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

describe("après la course : deux semaines faciles (MA6)", () => {
  it("runs 45 % then 65 % of the usual volume in footings", () => {
    const minutes = (w: ReturnType<typeof postRaceWeek>) => w.reduce((s, x) => s + x.durMin, 0);
    expect(minutes(postRaceWeek(180, P40, 3, 1))).toBe(81);
    expect(minutes(postRaceWeek(180, P40, 3, 2))).toBe(117);
    expect(postRaceWeek(180, P40, 3, 2).every((s) => s.type === "E")).toBe(true);
  });

  it("counts the two weeks from the goal's date, or from the race she ran once the goal is gone", () => {
    expect(lastRaceDay({ distanceM: 10000, date: "2026-11-22" }, [], MONDAY)).toBe("2026-11-22");
    const ran = [race(50, { start: "2026-11-15T09:00", isRace: true }), race(30, { start: "2026-11-18T09:00" })];
    expect(lastRaceDay(null, ran, MONDAY)).toBe("2026-11-15");
    expect(lastRaceDay(null, [], MONDAY)).toBeUndefined();
    expect([1, 7, 8, 14, 15, 0].map((d) => postRaceIndex(addDays(MONDAY, -d), MONDAY))).toEqual([
      1,
      1,
      2,
      2,
      null,
      null,
    ]);
  });

  it("plans footings only the second week after a race, even once she chose to keep fit", () => {
    const week = planWeek({
      monday: MONDAY,
      now: `${addDays(MONDAY, -1)}T18:00`,
      goal: null,
      settings: SETTINGS,
      history: [race(50, { start: `${addDays(MONDAY, -8)}T09:00`, distM: 10000, isRace: true })],
      fitness: { vdot: 40 },
      cal: [],
      kept: [],
    });
    expect(week.sessions.length).toBe(3);
    expect(week.sessions.every((s) => s.type === "E")).toBe(true);
  });
});
