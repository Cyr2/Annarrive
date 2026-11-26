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
  setAsideRefusal,
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

  it("proposes what two runs at the same pace with a heart rate 5 bpm lower prove, one point at most (RC-24)", () => {
    const lower = [...usual, tRun(17, 165), tRun(20, 165)];
    // 5 bpm at T for HRmax 190 is 5.2 % of VO2max by Swain's slope: 2 points at VDOT 40, so one.
    expect(at(lower)).toMatchObject({ ruleId: "RC14", from: 40, to: 41, evidence: ["a17", "a20"] });
    expect(evaluateKeySessions(lower, 30, addDays("2026-11-23", -30), [], NOW, HR_MAX)?.to).toBe(31);
  });

  it("needs both runs clearly lower, 21 days apart at most, after a baseline (RC-25)", () => {
    expect(at([...usual, tRun(17, 165), tRun(20, 167)])).toBeNull();
    expect(at([...usual, tRun(17, 167), tRun(20, 167)])).toBeNull();
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
    const lower = [...usual, tRun(17, 165), tRun(20, 165)];
    // 4 bpm or more always prove a full point above VDOT 25: 14 days after the last change.
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

  const LTHR = 170;
  const anchored = (keys: KeySession[], lastChange = addDays("2026-11-23", -30), history: PastProposal[] = []) =>
    evaluateKeySessions(keys, 40, lastChange, history, NOW, HR_MAX, LTHR);

  it("proposes a rise when two T runs at her pace sit 5 bpm under her threshold heart rate (RC-28, RC15)", () => {
    // 5 bpm under LTHR at T pace for HRmax 190 is 1.9 point at VDOT 40 by Swain's slope: one, without any baseline.
    const below = [tRun(17, 165), tRun(20, 164)];
    expect(anchored(below)).toMatchObject({ ruleId: "RC15", from: 40, to: 41, evidence: ["a17", "a20"] });
    // Waits like RC3: a full point 14 days after the last change.
    expect(anchored(below, addDays("2026-11-23", -10))).toBeNull();
    expect(anchored(below, addDays("2026-11-23", -15))?.to).toBe(41);
    expect(anchored(below, undefined, [past40("RC15")])).toBeNull();
  });

  it("needs both runs 5 bpm under, 21 days apart at most, at her T pace, after the change (RC-29)", () => {
    expect(anchored([tRun(17, 166), tRun(20, 165)])).toBeNull();
    expect(anchored([tRun(1, 165), tRun(24, 165)], "2026-10-01")).toBeNull();
    expect(evaluateKeySessions([tRun(17, 165), tRun(20, 165)], 40, undefined, [], NOW, HR_MAX)).toBeNull();
    expect(anchored([tRun(17, 165), tRun(20, 165)], "2026-11-18")).toBeNull();
    // 3 % slower than her T pace: a lower heart rate says nothing about the pace.
    const slow = tRun(20, 165);
    const laps = (slow.activity.laps ?? []).map((l, i) => (i === 1 ? { ...l, distM: 0.97 * l.distM } : l));
    expect(anchored([tRun(17, 165), { ...slow, activity: { ...slow.activity, laps } }])).toBeNull();
  });

  it("proposes easing when two T runs sit 5 bpm over her threshold heart rate, never a rise (RC-30, RC19)", () => {
    expect(anchored([tRun(17, 176), tRun(20, 176)])).toMatchObject({ ruleId: "RC19", from: 40, to: 39 });
    // RC14 sees 5 bpm under her usual 180, but both runs stay over her threshold heart rate: easing, not a rise.
    const fading = [tRun(1, 180), tRun(8, 180), tRun(17, 175), tRun(20, 175)];
    expect(at(fading)?.ruleId).toBe("RC14");
    expect(anchored(fading)?.ruleId).toBe("RC19");
    // RC20: within 14 days of the last change, nothing goes against it.
    expect(anchored([tRun(17, 176), tRun(20, 176)], "2026-11-12")).toBeNull();
  });
});

const past40 = (ruleId: string): PastProposal => ({
  proposal: { kind: "vdot", from: 39, to: 40, ruleId, evidence: [], expiresOn: "2026-11-27" },
  decision: "accepted",
  on: "2026-11-13",
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

  it("gives today's E to automatic sessions built with the old one, never to hers (C-11b, F7)", () => {
    // Built on 25/11 at Daniels' table value, 6:08 at VDOT 40.
    const old = (s: ReturnType<typeof easy>) => ({
      ...s,
      steps: s.steps.map((st) => ({ ...st, target: { ...st.target, paceSKm: [368, 368] as [number, number] } })),
    });
    const auto = old(easy("auto", "2026-11-27T18:00"));
    const hers = old(easy("hers", "2026-11-28T18:00", 45, { manual: true }));
    const r = repaceRanges(state([auto, hers], undefined, { vdot: 40 }), NOW);
    expect(r.state.sessions.map((s) => s.steps[0]?.target.paceSKm?.[0])).toEqual([paces(40).E, 368]);
    expect(r.changes.map((c) => c.sessionId)).toEqual(["auto"]);
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

describe("the plan follows her data both ways (RC16 to RC20)", () => {
  const HR_MAX = 190;
  const ago = (days: number) => addDays("2026-11-23", -days);
  /** An easy run of 40 min at that pace (s/km) and heart rate, flat and cool, no laps. */
  const easyRun = (day: number, paceSKm: number, hr: number, extra: Partial<KeySession> = {}): KeySession => {
    const start = `2026-11-${String(day).padStart(2, "0")}T18:00`;
    return {
      session: easy(`e${day}`, start, 40),
      activity: { id: `a${day}`, start, durMin: 40, distM: (40 * 60_000) / paceSKm, avgHr: hr, tempC: 12 },
      fractions: [],
      ...extra,
    };
  };
  const at = (keys: KeySession[], lastChange = ago(30), current = 40, hrMax = HR_MAX) =>
    evaluateKeySessions(keys, current, lastChange, [], NOW, hrMax);

  it("proposes faster footings when three easy runs are 2 % faster than E under the easy ceiling (RC-31, RC16)", () => {
    // E at VDOT 40 is 5:51 (351 s); 5:40 at 145 bpm (76 % of 190) is the E of VDOT 41.6: one point at most.
    const fast = [easyRun(10, 340, 145), easyRun(14, 340, 145), easyRun(18, 340, 145)];
    expect(at(fast)).toMatchObject({ ruleId: "RC16", from: 40, to: 41, evidence: ["a10", "a14", "a18"] });
    expect(at([easyRun(10, 340, 145), easyRun(14, 340, 152), easyRun(18, 340, 145)])).toBeNull();
    expect(at([...fast.slice(0, 2), easyRun(18, 340, 145, { externalFactor: true })])).toBeNull();
    expect(at([easyRun(10, 348, 145), easyRun(14, 348, 145), easyRun(18, 348, 145)])).toBeNull();
    expect(at(fast, ago(10))).toBeNull();
  });

  it("finds nothing to raise in her real week of 22 to 25/11: E already at 5'55 (RC-32)", () => {
    // VDOT 39.42, HRmax 195: 50 min at 6'27 (142), 33 min at 6'25 (131), 31 min at 6'04 (150, strides included).
    const runs = [
      { ...easyRun(22, 387, 142), activity: { ...easyRun(22, 387, 142).activity, durMin: 50, distM: 50 * 155.04 } },
      easyRun(24, 385, 131),
      easyRun(25, 364, 150),
    ];
    expect(evaluateKeySessions(runs, 39.42, ago(30), [], "2026-11-26T08:00", 195)).toBeNull();
  });

  it("proposes slower footings when two easy runs at E sit 3 bpm over the easy ceiling (RC-33, RC18)", () => {
    // Ceiling 79 % of 190 = 150; 156 bpm at 5:51: the E she would run at 150 bpm is that of VDOT 37.4, one point at most.
    const heavy = [easyRun(17, 351, 156), easyRun(20, 351, 156)];
    expect(at(heavy)).toMatchObject({ ruleId: "RC18", from: 40, to: 39, evidence: ["a17", "a20"] });
    expect(at([easyRun(17, 351, 152), easyRun(20, 351, 152)])).toBeNull();
    expect(at([easyRun(7, 351, 156), easyRun(20, 351, 156)], ago(40))).toBeNull();
    // Faster than her E on her own: a heart rate over the ceiling is her choice of pace, not her level.
    expect(at([easyRun(17, 330, 156), easyRun(20, 330, 156)])).toBeNull();
    expect(at([easyRun(17, 351, 156), easyRun(20, 351, 156, { externalFactor: true })])).toBeNull();
    // RC20: 10 days after a rise, nothing goes against it.
    expect(at(heavy, ago(10))).toBeNull();
  });

  const key = (day: number, feel: Activity["feel"], ratio = 1, extra: Partial<KeySession> = {}): KeySession => ({
    session: hard(`t${day}`, `2026-11-${day}T18:00`),
    activity: { id: `a${day}`, start: `2026-11-${day}T18:00`, durMin: 50, distM: 10000, ...(feel ? { feel } : {}) },
    fractions: [ratio],
    ...extra,
  });

  it("proposes a test when her last three key runs felt easy at the target pace (RC-34, RC17)", () => {
    const easyKeys = [key(10, "easy"), key(14, "easy"), key(18, "easy")];
    expect(at(easyKeys)).toMatchObject({ kind: "test", ruleId: "RC17", from: 40, to: 40 });
    expect(at(easyKeys, ago(10))).toBeNull();
    expect(at([key(10, "easy"), key(14, "ok"), key(18, "easy")])).toBeNull();
    expect(at([key(10, "easy"), key(14, "easy"), key(18, "easy", 1, { hrDelta: 3 })])).toBeNull();
    expect(at([key(10, "easy"), key(14, "easy"), key(18, "easy", 0.96)])).toBeNull();
  });

  it("proposes easing when her last three key runs felt hard at the target pace, never within 14 days (RC-36, RC19)", () => {
    const hardKeys = [key(10, "hard"), key(14, "hard"), key(18, "hard")];
    expect(at(hardKeys)).toMatchObject({ ruleId: "RC19", from: 40, to: 39 });
    expect(at(hardKeys, ago(10))).toBeNull();
    expect(at([key(10, "hard"), key(14, "ok"), key(18, "hard")])).toBeNull();
    expect(at([key(10, "hard"), key(14, "hard"), key(18, "hard", 1, { externalFactor: true })])).toBeNull();
  });
});

describe("setAsideRefusal (RC21)", () => {
  it("sets aside a run of the last 7 days, two in 14 days at most (RC-37)", () => {
    expect(setAsideRefusal("2026-11-20T18:00", [], NOW)).toBeNull();
    expect(setAsideRefusal("2026-11-15T18:00", [], NOW)).toBe("too_old");
    expect(setAsideRefusal("2026-11-20T18:00", ["2026-11-12T18:00"], NOW)).toBeNull();
    expect(setAsideRefusal("2026-11-20T18:00", ["2026-11-12T18:00", "2026-11-18T18:00"], NOW)).toBe("too_many");
    expect(setAsideRefusal("2026-11-20T18:00", ["2026-11-05T18:00", "2026-11-18T18:00"], NOW)).toBeNull();
  });
});
