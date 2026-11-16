import { describe, expect, it } from "vitest";
import type { Activity, DailySignal, KeySession, PastProposal } from "../src/index.ts";
import {
  acceptProposal,
  addDays,
  evaluateFeels,
  evaluateGoal,
  evaluateKeySessions,
  evaluateRace,
  evaluateTrends,
  paces,
  predictTime,
} from "../src/index.ts";
import { easy, hard, sixBy800, state } from "./fixtures.ts";

const NOW = "2026-11-23T08:00";
const ctx = { hrMax: 195, now: NOW };
const race = (distM: number, durMin: number, extra: Partial<Activity> = {}): Activity => ({
  id: "race",
  start: "2026-11-22T09:00",
  distM,
  durMin,
  isRace: true,
  tempC: 12,
  ...extra,
});

describe("evaluateRace (RC1, RC2)", () => {
  it("proposes the VDOT of a faster race (RC-1)", () => {
    expect(evaluateRace(race(21097.5, 105), 40.38, ctx)).toMatchObject({
      kind: "vdot",
      from: 40.38,
      to: 42.64,
      ruleId: "RC1",
    });
  });

  it("proposes the lower VDOT of a clearly slower race without excuse (RC-2)", () => {
    expect(evaluateRace(race(10000, 52), 40.38, ctx)).toMatchObject({
      to: 38.21,
      ruleId: "RC2",
      expiresOn: "2026-12-07",
    });
  });

  it("ignores the same race at 22 °C (RC-3)", () => {
    expect(evaluateRace(race(10000, 52, { tempC: 22 }), 40.38, ctx)).toBeNull();
  });

  it("ignores a gap of 1.0 (RC-4) and excused slow races", () => {
    expect(evaluateRace(race(10000, predictTime(39.38, 10000)), 40.38, ctx)).toBeNull();
    expect(evaluateRace(race(10000, 52, { tempC: 17 }), 40.38, ctx)).toBeNull();
    expect(evaluateRace(race(10000, 52), 40.38, { ...ctx, illnessLast14d: true })).toBeNull();
    expect(evaluateRace(race(10000, 52, { isRace: false }), 40.38, ctx)).toBeNull();
  });
});

describe("evaluateKeySessions (RC3, RC4, RC8)", () => {
  const key = (day: number, fractions: number[], extra: Partial<KeySession> = {}): KeySession => ({
    session: hard(`t${day}`, `2026-11-${day}T18:00`),
    activity: { id: `a${day}`, start: `2026-11-${day}T18:00`, durMin: 50, distM: 10000 },
    fractions,
    hrDelta: 2,
    ...extra,
  });
  const thirtyDaysAgo = addDays("2026-11-23", -30);

  it("proposes +1 after two T sessions at 101 % 30 days after the last change (RC-5)", () => {
    const p = evaluateKeySessions([key(17, [1.01]), key(20, [1.01, 1.01])], 40, thirtyDaysAgo, [], NOW);
    expect(p).toMatchObject({ to: 41, ruleId: "RC3", evidence: ["a17", "a20"] });
  });

  it("needs two sessions (RC-6) and 28 days since the last change (RC-7)", () => {
    expect(evaluateKeySessions([key(20, [1.03])], 40, thirtyDaysAgo, [], NOW)).toBeNull();
    expect(evaluateKeySessions([key(17, [1.01]), key(20, [1.01])], 40, addDays("2026-11-23", -20), [], NOW)).toBeNull();
  });

  it("leaves aberrant fractions out", () => {
    expect(evaluateKeySessions([key(17, [1.2, 0.98]), key(20, [1.01])], 40, thirtyDaysAgo, [], NOW)).toBeNull();
  });

  it("proposes -1 after two I sessions in a row at 95 % (RC-8)", () => {
    const i = (day: number, extra: Partial<KeySession> = {}) =>
      key(day, [0.95], { session: sixBy800(`i${day}`), ...extra });
    expect(evaluateKeySessions([i(17), i(20)], 40, undefined, [], NOW)).toMatchObject({ to: 39, ruleId: "RC4" });
    expect(evaluateKeySessions([i(17), i(20, { externalFactor: true })], 40, undefined, [], NOW)).toBeNull();
  });

  it("does not repropose a rise refused 10 days ago (RC-10)", () => {
    const refused: PastProposal[] = [
      {
        proposal: { kind: "vdot", from: 40, to: 41, ruleId: "RC3", evidence: [], expiresOn: "2026-11-27" },
        decision: "refused",
        on: addDays("2026-11-23", -10),
      },
    ];
    expect(evaluateKeySessions([key(17, [1.01]), key(20, [1.01])], 40, thirtyDaysAgo, refused, NOW)).toBeNull();
    expect(evaluateKeySessions([key(17, [0.95]), key(20, [0.95])], 40, thirtyDaysAgo, refused, NOW)?.ruleId).toBe(
      "RC4",
    );
  });
});

describe("evaluateTrends (RC6, RC7)", () => {
  it("proposes a test when Garmin VO2max rises by 2 for 14 days (RC-11)", () => {
    const signals: DailySignal[] = [
      { date: addDays("2026-11-23", -20), vo2max: 42 },
      ...[14, 10, 5, 0].map((d) => ({ date: addDays("2026-11-23", -d), vo2max: 44.5 })),
    ];
    expect(evaluateTrends(signals, [], 40, NOW)).toMatchObject({ kind: "test", from: 42, to: 44.5, ruleId: "RC7" });
    expect(evaluateTrends(signals.slice(0, 1), [], 40, NOW)).toBeNull();
  });

  it("proposes -1 when HR at easy pace stays 5 bpm up for 14 days", () => {
    const base = [50, 45, 40, 35].map((d) => ({ date: addDays("2026-11-23", -d), hr: 140 }));
    const up = [20, 15, 10, 5].map((d) => ({ date: addDays("2026-11-23", -d), hr: 146 }));
    expect(evaluateTrends([], [...base, ...up], 40, NOW)).toMatchObject({ to: 39, ruleId: "RC6" });
    expect(evaluateTrends([], [...base, ...up.slice(2)], 40, NOW)).toBeNull();
    expect(evaluateTrends([], up, 40, NOW)).toBeNull();
  });
});

describe("evaluateFeels (RC5)", () => {
  it("needs three hard feels in a row on easy sessions", () => {
    const f = (d: string, feel: "hard" | "ok") => ({ sessionId: d, date: d, feel, rpeTarget: 3 });
    expect(
      evaluateFeels([f("2026-11-18", "hard"), f("2026-11-20", "hard"), f("2026-11-22", "hard")], 40, NOW)?.to,
    ).toBe(39);
    expect(
      evaluateFeels([f("2026-11-18", "hard"), f("2026-11-20", "ok"), f("2026-11-22", "hard")], 40, NOW),
    ).toBeNull();
  });
});

describe("evaluateGoal (RC10)", () => {
  const g = { p0Min: 110, targetMin: 100, rate: 0.0035, weeksLeft: 10, previousOff: true, alreadySignalled: false };

  it("signals once after two misses in a row, never proposing a time", () => {
    expect(evaluateGoal(g)).toEqual({ off: true, signal: true });
    expect(evaluateGoal({ ...g, alreadySignalled: true }).signal).toBe(false);
    expect(evaluateGoal({ ...g, previousOff: false }).signal).toBe(false);
    expect(evaluateGoal({ ...g, targetMin: 106.2 })).toEqual({ off: false, signal: false });
  });
});

describe("acceptProposal (RC9)", () => {
  it("repaces future sessions except today's frozen one and a manual Q (RC-12)", () => {
    const today = easy("today", "2026-11-23T18:00", 45, { frozen: true });
    const manual = sixBy800("q", "2026-11-26T18:00");
    const other = easy("e", "2026-11-28T09:00");
    const st = state([today, { ...manual, manual: true }, other]);
    const r = acceptProposal(
      st,
      { kind: "vdot", from: 40, to: 41, ruleId: "RC3", evidence: [], expiresOn: "2026-12-07" },
      NOW,
    );
    expect(r.state.sessions[0]).toEqual(st.sessions[0]);
    expect(r.state.sessions[1]).toEqual(st.sessions[1]);
    expect(r.state.sessions[2]?.steps[0]?.target.paceSKm).toEqual(paces(41).E);
    expect(r.state).toMatchObject({ vdot: 41, vdotChangedOn: "2026-11-23" });
  });

  it("changes no pace for a test proposal", () => {
    const st = state([easy("e", "2026-11-28T09:00")]);
    const r = acceptProposal(
      st,
      { kind: "test", from: 42, to: 44.5, ruleId: "RC7", evidence: [], expiresOn: "2026-12-07" },
      NOW,
    );
    expect(r.state).toBe(st);
  });
});
