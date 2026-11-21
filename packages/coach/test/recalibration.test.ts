import { describe, expect, it } from "vitest";
import type { Activity, DailySignal, KeySession, PastProposal } from "../src/index.ts";
import {
  acceptProposal,
  addDays,
  evaluateFeels,
  evaluateKeySessions,
  evaluateRace,
  evaluateTrends,
  paces,
  predictTime,
  proposeMeasured,
  repaceRanges,
  vdot,
} from "../src/index.ts";
import { easy, hard, long, sixBy800, state } from "./fixtures.ts";

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

  it("reads a test on its effort lap, not with its warm-up (RC-18)", () => {
    // 10 min easy, 20 min all out at the speed of VDOT 44, 5 min easy.
    const fast = 4400 / 20;
    const laps = [
      { durMin: 10, distM: 1500, avgHr: 140 },
      { durMin: 20, distM: 20 * fast, avgHr: 182 },
      { durMin: 5, distM: 700, avgHr: 150 },
    ];
    const test: Activity = {
      id: "t",
      start: "2026-11-22T09:00",
      durMin: 35,
      distM: 2200 + 20 * fast,
      isTest: true,
      laps,
      tempC: 12,
    };
    expect(evaluateRace(test, 40, ctx)?.to).toBeCloseTo(vdot(4400, 20), 1);
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

  const easyKey = (day: number, fractions: number[], extra: Partial<KeySession> = {}): KeySession => {
    const k = key(day, fractions, extra);
    return { ...k, activity: { ...k.activity, feel: "easy" } };
  };

  it("proposes the proven VDOT, one point at most, after two easy-feeling T sessions at 103 % (RC-5)", () => {
    const p = evaluateKeySessions([easyKey(17, [1.03]), easyKey(20, [1.03, 1.03])], 40, thirtyDaysAgo, [], NOW);
    expect(p).toMatchObject({ to: 41, ruleId: "RC3", evidence: ["a17", "a20"] });
    const small = evaluateKeySessions([easyKey(17, [1.02]), easyKey(20, [1.02])], 40, thirtyDaysAgo, [], NOW);
    // 2 % faster at T proves about one point at VDOT 40 (40.998): what it proves, not a rounded +1.
    expect(small?.to).toBeGreaterThan(40.5);
    expect(small?.to).toBeLessThanOrEqual(41);
  });

  it("needs two sessions (RC-6) and, below a full point, 28 days since the last change (RC-7)", () => {
    expect(evaluateKeySessions([easyKey(20, [1.03])], 40, thirtyDaysAgo, [], NOW)).toBeNull();
    const twentyDays = addDays("2026-11-23", -20);
    expect(evaluateKeySessions([easyKey(17, [1.02]), easyKey(20, [1.02])], 40, twentyDays, [], NOW)).toBeNull();
  });

  it("caps a clear proof at one point and waits 14 days for it (RC-13)", () => {
    const keys = [easyKey(17, [1.06]), easyKey(20, [1.08])];
    expect(evaluateKeySessions(keys, 34, addDays("2026-11-23", -10), [], NOW)).toBeNull();
    expect(evaluateKeySessions(keys, 34, addDays("2026-11-23", -15), [], NOW)).toMatchObject({ to: 35, ruleId: "RC3" });
  });

  it("asks for a clearly faster pattern with a supporting sign, not laps on target (RC-14)", () => {
    expect(evaluateKeySessions([key(17, [1.01]), key(20, [1.01])], 40, thirtyDaysAgo, [], NOW)).toBeNull();
    expect(evaluateKeySessions([key(17, [1.03]), key(20, [1.03])], 40, thirtyDaysAgo, [], NOW)).toBeNull();
    const lowHr = [key(17, [1.03], { hrDelta: -2 }), key(20, [1.03], { hrDelta: 0 })];
    expect(evaluateKeySessions(lowHr, 40, thirtyDaysAgo, [], NOW)).toMatchObject({ to: 41 });
  });

  it("reads only the sessions run after the last change, once per 14 days (RC-15, RC-16)", () => {
    const keys = [easyKey(17, [1.06]), easyKey(20, [1.06])];
    // The 17th and 20th proved the level she accepted on the 20th: they never prove it again.
    expect(evaluateKeySessions(keys, 41, "2026-11-20", [], NOW)).toBeNull();
    const accepted: PastProposal[] = [
      {
        proposal: { kind: "vdot", from: 39, to: 40, ruleId: "RC3", evidence: [], expiresOn: "2026-11-27" },
        decision: "accepted",
        on: addDays("2026-11-23", -10),
      },
    ];
    expect(evaluateKeySessions(keys, 40, undefined, accepted, NOW)).toBeNull();
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

describe("evaluateKeySessions by heart rate (RC14)", () => {
  const HR_MAX = 190;
  const tSpeed = 60_000 / paces(40).T;
  /** 15 min easy, then a T run at its target with that heart rate, as Garmin laps a structured workout. */
  const tRun = (day: number, hr: number, extra: Partial<KeySession> = {}, work = [20]): KeySession => {
    const start = `2026-11-${String(day).padStart(2, "0")}T18:00`;
    const laps = [
      { durMin: 15, distM: 15 * 160, avgHr: 135 },
      ...work.map((durMin) => ({ durMin, distM: durMin * tSpeed, avgHr: hr })),
    ];
    return {
      session: hard(`t${day}`, start, 20),
      activity: { id: `a${day}`, start, durMin: 45, distM: 2400 + 20 * tSpeed, laps, tempC: 12 },
      fractions: laps.map((l) => l.distM / l.durMin / tSpeed),
      ...extra,
    };
  };
  const at = (keys: KeySession[], lastChange = addDays("2026-11-23", -30), history: PastProposal[] = []) =>
    evaluateKeySessions(keys, 40, lastChange, history, NOW, HR_MAX);
  const usual = [tRun(1, 170), tRun(8, 170)];

  it("proposes what two runs at the same pace with a heart rate 3 bpm lower prove, one point at most (RC-24)", () => {
    const lower = [...usual, tRun(17, 167), tRun(20, 167)];
    // 3 bpm at T for HRmax 190 is 3.1 % of VO2max by Swain's slope: 1.2 point at VDOT 40, so one.
    expect(at(lower)).toMatchObject({ ruleId: "RC14", from: 40, to: 41, evidence: ["a17", "a20"] });
    expect(evaluateKeySessions(lower, 30, addDays("2026-11-23", -30), [], NOW, HR_MAX)?.to).toBe(30.93);
  });

  it("needs both runs clearly lower, 21 days apart at most, after a baseline (RC-25)", () => {
    expect(at([...usual, tRun(17, 166), tRun(20, 168)])).toBeNull();
    expect(at([...usual, tRun(17, 168), tRun(20, 168)])).toBeNull();
    expect(at([tRun(17, 166), tRun(20, 166)])).toBeNull();
    const farApart = [tRun(1, 170), tRun(2, 166), tRun(24, 166)];
    expect(at(farApart, "2026-10-01")).toBeNull();
  });

  it("never lowers the level and reads no hot, hilly or short-rep run (RC-26)", () => {
    expect(at([...usual, tRun(17, 176), tRun(20, 176)])).toBeNull();
    expect(evaluateKeySessions([...usual, tRun(17, 166), tRun(20, 166)], 40, undefined, [], NOW)).toBeNull();
    const hot = tRun(20, 166, {});
    expect(at([...usual, tRun(17, 166), { ...hot, activity: { ...hot.activity, tempC: 25 } }])).toBeNull();
    const hilly = { ...hot, activity: { ...hot.activity, elevGainM: 150 } };
    expect(at([...usual, tRun(17, 166), hilly])).toBeNull();
    expect(at([...usual, tRun(17, 166), tRun(20, 166, {}, [5, 5, 5, 5])])).toBeNull();
    expect(at([...usual, tRun(17, 166), tRun(20, 166, { externalFactor: true })])).toBeNull();
  });

  it("waits like RC3 and once per 14 days (RC-27)", () => {
    const lower = [...usual, tRun(17, 167), tRun(20, 167)];
    const level30 = (days: number) => evaluateKeySessions(lower, 30, addDays("2026-11-23", -days), [], NOW, HR_MAX);
    // Under a point: 28 days after the last change; a full point: 14.
    expect(level30(20)).toBeNull();
    expect(at(lower, addDays("2026-11-23", -10))).toBeNull();
    expect(at(lower, addDays("2026-11-23", -15))?.to).toBe(41);
    const past = (ruleId: string, decision: PastProposal["decision"]): PastProposal[] => [
      {
        proposal: { kind: "vdot", from: 39, to: 40, ruleId, evidence: [], expiresOn: "2026-11-27" },
        decision,
        on: addDays("2026-11-23", -10),
      },
    ];
    expect(at(lower, undefined, past("RC14", "accepted"))).toBeNull();
    expect(at(lower, undefined, past("RC3", "refused"))).toBeNull();
    // The runs before the change are her baseline; the pair must come after it.
    expect(at(lower, "2026-11-18")).toBeNull();
  });
});

const recent = (ruleId: string, daysAgo: number): PastProposal[] => [
  {
    proposal: { kind: "test", from: 40, to: 40, ruleId, evidence: [], expiresOn: "2026-12-01" },
    decision: "accepted",
    on: addDays("2026-11-23", -daysAgo),
  },
];

describe("evaluateTrends (RC7)", () => {
  it("proposes a test when Garmin VO2max rises by 2 for 14 days, once per 14 days (RC-11)", () => {
    const signals: DailySignal[] = [
      { date: addDays("2026-11-23", -20), vo2max: 42 },
      ...[14, 10, 5, 0].map((d) => ({ date: addDays("2026-11-23", -d), vo2max: 44.5 })),
    ];
    expect(evaluateTrends(signals, NOW)).toMatchObject({ kind: "test", from: 42, to: 44.5, ruleId: "RC7" });
    expect(evaluateTrends(signals.slice(0, 1), NOW)).toBeNull();
    expect(evaluateTrends(signals, NOW, recent("RC7", 5))).toBeNull();
  });
});

describe("evaluateFeels (RC5)", () => {
  const f = (d: string, feel: "hard" | "ok") => ({ sessionId: d, date: d, feel, rpeTarget: 3 });
  const three = [f("2026-11-18", "hard"), f("2026-11-20", "hard"), f("2026-11-22", "hard")];

  it("proposes a test, never a lower level, after three hard feels in a row on easy sessions (RC-19)", () => {
    expect(evaluateFeels(three, 40, NOW)).toMatchObject({ kind: "test", from: 40, to: 40, ruleId: "RC5" });
    const broken = [f("2026-11-18", "hard"), f("2026-11-20", "ok"), f("2026-11-22", "hard")];
    expect(evaluateFeels(broken, 40, NOW)).toBeNull();
  });

  it("reads fatigue as fatigue, counts only feels after the last change, once per 14 days (RC-20)", () => {
    expect(evaluateFeels(three, 40, NOW, { fatigueDays: ["2026-11-20"] })).toBeNull();
    expect(evaluateFeels(three, 40, NOW, { lastChange: "2026-11-19" })).toBeNull();
    expect(evaluateFeels(three, 40, NOW, { history: recent("RC5", 10) })).toBeNull();
    expect(evaluateFeels(three, 40, NOW, { history: recent("RC5", 15) })?.ruleId).toBe("RC5");
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
    expect(r.state.sessions[2]?.steps[0]?.target.paceSKm).toEqual([paces(41).E, paces(41).E]);
    expect(r.state).toMatchObject({ vdot: 41, vdotChangedOn: "2026-11-23" });
  });

  it("changes no pace for a test proposal: the test replaces the next Q, else nothing moves (RC-17)", () => {
    const test = { kind: "test" as const, from: 42, to: 44.5, ruleId: "RC7", evidence: [], expiresOn: "2026-12-07" };
    const st = state([easy("e", "2026-11-28T09:00")]);
    expect(acceptProposal(st, test, NOW).state).toBe(st);
    const withQ = state([sixBy800("q", "2026-11-26T18:00"), easy("e", "2026-11-28T09:00")]);
    const r = acceptProposal(withQ, test, NOW);
    expect(r.state.sessions[0]).toMatchObject({ id: "q", type: "TEST", start: "2026-11-26T18:00" });
    expect(r.state.sessions[1]).toEqual(withQ.sessions[1]);
    expect(r.state.vdot).toBe(40);
    // A base week: the test takes the easy run with strides, never the plain one (EV-20).
    const strides = {
      ...easy("s", "2026-11-27T18:00"),
      steps: [
        ...easy("s", "").steps,
        { kind: "strides" as const, durMin: 1 / 3, reps: 6, zone: "R" as const, target: { rpe: 3 } },
      ],
    };
    const base = acceptProposal(state([easy("e", "2026-11-25T18:00"), strides]), test, NOW);
    expect(base.state.sessions.map((s) => s.type)).toEqual(["E", "TEST"]);
  });
});

describe("repaceRanges (C4)", () => {
  // A session stored before one pace per step: a [fast, slow] range, as « 6'05 à 7'16 /km ».
  const ranged = (s: ReturnType<typeof long>) => ({
    ...s,
    steps: s.steps.map((st) => ({ ...st, target: { ...st.target, paceSKm: [365, 436] as [number, number] } })),
  });

  it("gives one pace to the ranged sessions ahead, never to a frozen or a past one (C-11)", () => {
    const past = ranged(long("past", "2026-11-22T09:00"));
    const soon = ranged(easy("soon", "2026-11-23T18:00"));
    const frozen = ranged(easy("frozen", "2026-11-25T18:00", 45, { frozen: true }));
    const ahead = ranged(long("ahead", "2026-11-29T09:00"));
    const single = easy("single", "2026-11-27T18:00");
    const st = state([past, soon, frozen, ahead, single], undefined, { vdot: 40 });
    const r = repaceRanges(st, NOW);
    expect(r.state.sessions.slice(0, 3)).toEqual(st.sessions.slice(0, 3));
    expect(r.state.sessions[3]?.steps[0]?.target.paceSKm).toEqual([paces(40).E, paces(40).E]);
    expect(r.state.sessions[4]).toBe(single);
    expect(r.changes.map((c) => c.sessionId)).toEqual(["ahead"]);
    expect(repaceRanges(r.state, NOW).changes).toEqual([]);
  });
});

describe("proposeMeasured (F10, RC11)", () => {
  it("proposes the first measured level in place of the provisional one", () => {
    const measured = { vdot: 43.2, status: "measured" as const, source: "effort:a1" };
    expect(proposeMeasured(40, measured, NOW)).toMatchObject({ kind: "vdot", from: 40, to: 43.2, ruleId: "F10" });
  });

  it("stays silent for another provisional guess or a level within half a point", () => {
    expect(proposeMeasured(40, { vdot: 45, status: "provisional", source: "declared" }, NOW)).toBeNull();
    expect(proposeMeasured(40, { vdot: 40.4, status: "measured", source: "effort:a1" }, NOW)).toBeNull();
  });

  it("raises a level F10 measured alone (34.2 detrained) to a better reading, never lowers it (RC-21)", () => {
    const tempo = { vdot: 38.06, status: "measured" as const, source: "effort:garmin:25045694091" };
    expect(proposeMeasured(34.24, tempo, NOW, { riseOnly: true })).toMatchObject({
      from: 34.24,
      to: 38.06,
      ruleId: "F10",
      evidence: ["effort:garmin:25045694091"],
    });
    expect(proposeMeasured(40, tempo, NOW, { riseOnly: true })).toBeNull();
  });

  it("does not propose F10 again within 14 days of an answer (RC-22, RC8)", () => {
    const measured = { vdot: 38, status: "measured" as const, source: "effort:a1" };
    const p = proposeMeasured(34, measured, NOW);
    if (!p) throw new Error("no proposal");
    const refused = [{ proposal: p, decision: "refused" as const, on: "2026-11-10" }];
    expect(proposeMeasured(34, measured, NOW, { riseOnly: true, history: refused })).toBeNull();
    expect(proposeMeasured(34, measured, "2026-11-25T08:00", { riseOnly: true, history: refused })).not.toBeNull();
  });
});
