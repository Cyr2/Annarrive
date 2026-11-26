import { describe, expect, it } from "vitest";
import type { Activity, CalEvent, RequestInput, Session, SessionAsk } from "../src/index.ts";
import { addDays, dateOf, isHard, paces, requestSession, weekFrame } from "../src/index.ts";
import { block, easy, hard, long, MONDAY, SETTINGS } from "./fixtures.ts";

/** Four runs of `durMin` a week for 20 weeks before MONDAY. */
const runs = (durMin: number, extra: Partial<Activity> = {}): Activity[] =>
  [...Array(80).keys()].map((i) => ({
    id: `a${i}`,
    start: `${addDays(MONDAY, -7 * (1 + Math.floor(i / 4)) + (i % 4) * 2)}T08:00`,
    durMin,
    distM: durMin * 160,
    ...extra,
  }));

const day = (k: number): string => addDays(MONDAY, k);
/** Development week (programme started 7 weeks ago): T Tuesday, E Wednesday and Friday, L Sunday. */
const DEV_WEEK: Session[] = [
  hard("q1", `${day(1)}T18:00`, 50, { priority: 2 }),
  easy("e1", `${day(2)}T18:00`, 45),
  easy("e2", `${day(4)}T18:00`, 45),
  long("l1", `${day(6)}T10:00`, 90),
];

const input = (ask: SessionAsk, extra: Partial<RequestInput> = {}): RequestInput => ({
  now: `${MONDAY}T08:00`,
  goal: { distanceM: 21097.5, date: "2027-03-21" },
  planStart: "2026-10-05",
  settings: SETTINGS,
  history: runs(60),
  fitness: { vdot: 40 },
  cal: [],
  health: { kind: "ok" },
  sessions: DEV_WEEK,
  ask,
  ...extra,
});

const accept = (r: ReturnType<typeof requestSession>) => {
  if (!r.ok) throw new Error(r.refusal.message);
  return r;
};
const refuse = (r: ReturnType<typeof requestSession>) => {
  if (r.ok) throw new Error("accepted");
  return r;
};
const weekOf = (sessions: Session[]) => sessions.filter((s) => s.start >= MONDAY && s.start < day(7));

describe("requestSession (M14)", () => {
  it("is set in a development week", () => {
    expect(weekFrame({ ...input({ type: "E" }), monday: MONDAY }, paces(40)).phase).toBe("dev");
  });

  it("RQ-1: replaces Friday's footing by a threshold run, same hour, nothing else moves", () => {
    const r = accept(requestSession(input({ type: "T", replace: "e2" })));
    expect(r.session).toMatchObject({ id: "e2", type: "T", start: `${day(4)}T18:00`, manual: true });
    expect(r.changes).toHaveLength(1);
    expect(r.sessions.filter((s) => s.id !== "e2")).toEqual(DEV_WEEK.filter((s) => s.id !== "e2"));
  });

  it("RQ-2: adds intervals on a free Thursday as a run more, shortening footings ahead to keep the week under G2", () => {
    const r = accept(requestSession(input({ type: "I", days: [day(3)] })));
    expect(r.session).toMatchObject({ type: "I", manual: true });
    expect(dateOf(r.session.start)).toBe(day(3));
    expect(r.notes.map((n) => n.ruleId)).toEqual(expect.arrayContaining(["RQ8", "RQ9"]));
    const total = weekOf(r.sessions).reduce((sum, s) => sum + s.durMin, 0);
    expect(total).toBeLessThanOrEqual(1.1 * 240);
  });

  it("RQ-3: a hard run the day after another is refused (H4), another day of the week is offered", () => {
    const r = refuse(requestSession(input({ type: "I", days: [day(2)] })));
    expect(r.refusal.ruleId).toBe("H4");
    expect(r.alternative?.session.type).toBe("I");
    expect(dateOf(r.alternative?.session.start ?? "")).not.toBe(day(2));
  });

  it("RQ-4: a third hard run turns the lowest-priority automatic one into a footing (P11)", () => {
    const sessions = [
      hard("q1", `${day(0)}T18:00`, 50, { priority: 2 }),
      { ...hard("q2", `${day(2)}T18:00`, 50), priority: 3 as const },
      easy("e1", `${day(3)}T18:00`, 45),
      long("l1", `${day(6)}T10:00`, 90),
    ];
    const r = accept(requestSession(input({ type: "I", days: [day(4)] }, { sessions })));
    const q2 = r.sessions.find((s) => s.id === "q2");
    expect(q2?.type).toBe("E");
    expect(q2?.durMin).toBeLessThanOrEqual(50);
    expect(weekOf(r.sessions).filter((s) => isHard(s) && s.type !== "L")).toHaveLength(2);
    expect(r.notes.some((n) => n.ruleId === "RQ7")).toBe(true);
  });

  it("RQ-5: no hard run during the taper (P18): an easy run instead", () => {
    const goal = { distanceM: 10000 as const, date: day(8) };
    const ask = { type: "I" as const, days: [day(3)] };
    expect(weekFrame({ ...input(ask, { goal }), monday: MONDAY }, paces(40)).phase).toBe("taper");
    const r = refuse(requestSession(input(ask, { goal })));
    expect(r.refusal.ruleId).toBe("P18");
    expect(r.alternative?.session.type).toBe("E");
  });

  it("RQ-6: nothing while feverish (EV9); with a cold, no hard run, a shortened footing instead (RQ3)", () => {
    const sick = refuse(requestSession(input({ type: "E" }, { health: { kind: "sick", since: MONDAY } })));
    expect(sick.refusal.ruleId).toBe("EV9");
    expect(sick.alternative).toBeUndefined();
    const cold = refuse(
      requestSession(input({ type: "T", replace: "e2" }, { health: { kind: "cold", since: MONDAY } })),
    );
    expect(cold.refusal.ruleId).toBe("RQ3");
    expect(cold.alternative?.session).toMatchObject({ id: "e2", type: "E", durMin: 20 });
  });

  it("RQ-7: a long run asked on Saturday moves Sunday's, capped at 1.10 × her longest run of 30 days (G1)", () => {
    const r = accept(requestSession(input({ type: "L", days: [day(5)], durMin: 150 })));
    expect(r.session).toMatchObject({ id: "l1", type: "L", durMin: 66 });
    expect(dateOf(r.session.start)).toBe(day(5));
    expect(r.notes.map((n) => n.ruleId)).toEqual(["RQ5", "RQ7"]);
    expect(r.notes[0]?.message).toBe(
      "1 h 06 au plus : 10 % de plus que ta plus longue course du mois, et la limite de ton plan",
    );
  });

  it("RQ-8: a week already at its cap refuses a run more (G2), and a second run more is refused (RQ8)", () => {
    const floors = DEV_WEEK.map((s) => (s.type === "E" ? easy(s.id, s.start, 30) : s));
    const g2 = refuse(requestSession(input({ type: "E", days: [day(3)] }, { history: runs(40), sessions: floors })));
    expect(g2.refusal.ruleId).toBe("G2");
    const five = [...DEV_WEEK, easy("e3", `${day(0)}T18:00`, 30)];
    const r = refuse(requestSession(input({ type: "E", days: [day(3)], durMin: 20 }, { sessions: five })));
    expect(r.refusal.ruleId).toBe("RQ8");
  });

  it("RQ-9: today is refused once its last slot has gone (RQ1); tomorrow onwards is offered", () => {
    const r = refuse(requestSession(input({ type: "E", days: [MONDAY] }, { now: `${MONDAY}T22:15` })));
    expect(r.refusal).toEqual({ ruleId: "RQ1", message: "Plus de créneau ce jour-là" });
    expect(dateOf(r.alternative?.session.start ?? "") > MONDAY).toBe(true);
  });

  it("RQ-10: classes all Thursday bar it (H1); legs on Wednesday evening push a Thursday Q past 24 h (H5)", () => {
    const classes: CalEvent[] = [block("c", `${day(3)}T07:00`, `${day(3)}T21:30`, "class")];
    const r = refuse(requestSession(input({ type: "E", days: [day(3)] }, { cal: classes })));
    expect(r.refusal.ruleId).toBe("H1");
    expect(r.alternative).toBeDefined();
    const legs: CalEvent = { ...block("legs", `${day(2)}T17:00`, `${day(2)}T18:30`, "strength"), legs: true };
    const sessions = DEV_WEEK.filter((s) => s.id !== "e1");
    const q = accept(requestSession(input({ type: "T", days: [day(3)] }, { cal: [legs], sessions })));
    expect(q.session.start >= `${day(3)}T18:30`).toBe(true);
  });

  it("RQ-11: a frozen, past or race session is never replaced (RQ2)", () => {
    const frozen = DEV_WEEK.map((s) => (s.id === "e2" ? { ...s, frozen: true } : s));
    const r = refuse(requestSession(input({ type: "T", replace: "e2" }, { sessions: frozen })));
    expect(r.refusal.ruleId).toBe("RQ2");
    expect(r.alternative).toBeUndefined();
  });

  it("RQ-12: base phase: no intervals, a fartlek instead (RQ4)", () => {
    const r = refuse(requestSession(input({ type: "I", days: [day(3)] }, { planStart: "2026-11-16" })));
    expect(r.refusal.ruleId).toBe("RQ4");
    expect(r.alternative?.session.type).toBe("FARTLEK");
  });

  it("RQ-13: without a goal, no race-pace run: a threshold run instead (RQ4)", () => {
    const r = refuse(requestSession(input({ type: "SPE", days: [day(3)] }, { goal: null })));
    expect(r.refusal.message).toBe("Sans objectif, il n'y a pas d'allure de course à travailler");
    expect(r.alternative?.session.type).toBe("T");
  });

  it("RQ-14: the easy weeks after a race take no hard run (MA6)", () => {
    const race: Activity = { id: "race", start: `${day(-2)}T09:00`, durMin: 100, distM: 21097.5, isRace: true };
    const r = refuse(
      requestSession(input({ type: "T", days: [day(3)] }, { goal: null, history: [...runs(60), race] })),
    );
    expect(r.refusal.ruleId).toBe("MA6");
    expect(r.alternative?.session.type).toBe("E");
  });

  it("RQ-15: an easy run on a day with a planned footing replaces it, and a day outside the window is refused", () => {
    const r = accept(requestSession(input({ type: "E", days: [day(2)], durMin: 60 })));
    expect(r.session).toMatchObject({ id: "e1", durMin: 60 });
    const far = refuse(requestSession(input({ type: "E", days: [day(15)] })));
    expect(far.refusal.ruleId).toBe("RQ1");
  });
});
