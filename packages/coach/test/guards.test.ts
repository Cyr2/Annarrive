import { describe, expect, it } from "vitest";
import type { Session } from "../src/index.ts";
import {
  capWeekSpikes,
  distributionCheck,
  enforceDistribution,
  isHard,
  makeSession,
  resumeWeek,
  returnAfterBreak,
  sessionLoad,
  spikeCap,
  trainingLoad,
  trimTo,
  validateWeek,
  weeklyCaps,
} from "../src/index.ts";
import { easy, hard, long, P40, sixBy800, week } from "./fixtures.ts";

const total = (w: Session[]): number => w.reduce((s, x) => s + x.durMin, 0);
const dur = (w: Session[], id: string): number | undefined => w.find((s) => s.id === id)?.durMin;

describe("spikeCap and capWeekSpikes (G1)", () => {
  it("caps a 100 min long run at 88 and moves the surplus to an E (G-1)", () => {
    const r = capWeekSpikes([long("l", "", 100), easy("e", "", 40)], 80);
    expect(dur(r.week, "l")).toBe(88);
    expect(dur(r.week, "e")).toBe(52);
  });

  it("loses the surplus when no E stays under the cap (G-2)", () => {
    const r = capWeekSpikes([long("l", "", 100), easy("e", "", 80)], 80);
    expect(dur(r.week, "l")).toBe(88);
    expect(dur(r.week, "e")).toBe(80);
    expect(r.changes.map((c) => c.ruleId)).toEqual(["G1"]);
  });

  it("also caps the planned distance against the longest distance of 30 days", () => {
    const r = spikeCap(long("l", "", 80), 100, 10_000);
    expect(r.session.durMin).toBeLessThan(80);
    expect(r.surplusMin).toBeGreaterThan(0);
    expect(spikeCap(easy("e", "", 40), 80).surplusMin).toBe(0);
  });
});

describe("weeklyCaps (G2 to G5)", () => {
  const w220 = [
    long("l", "", 90),
    hard("q", "", 60, { priority: 2 }),
    easy("e", "", 40),
    makeSession("RECUP", [{ kind: "work", durMin: 30, zone: "E", target: { rpe: 2 } }], { id: "r" }),
  ];

  it("cuts the lowest priority easy runs to 1.10 × last week (G-3)", () => {
    const r = weeklyCaps(w220, [{ minutes: 190 }]);
    expect(total(r.week)).toBe(209);
    expect(r.changes.every((c) => (c.before?.priority ?? 0) >= 4)).toBe(true);
    expect(dur(r.week, "r")).toBe(20);
  });

  it("forces 14 days down to 1.30 × the previous 14 days (G-4)", () => {
    const w = [long("l", "", 100), easy("e1", "", 50), easy("e2", "", 50)];
    const r = weeklyCaps(w, [{ minutes: 150 }, { minutes: 150 }, { minutes: 200 }]);
    expect(total(r.week) + 200).toBe(390);
    expect(r.changes[0]?.ruleId).toBe("G3");
  });

  it("ignores strength: 180 min of running after 180 changes nothing (G-5)", () => {
    const w = [long("l", "", 90), easy("e1", "", 45), easy("e2", "", 45)];
    expect(weeklyCaps(w, [{ minutes: 180 }]).changes).toEqual([]);
    expect(weeklyCaps(w, []).changes).toEqual([]);
  });

  it("drops 25 % after three rising weeks (G4)", () => {
    const w = [long("l", "", 90), easy("e1", "", 60), easy("e2", "", 60)];
    const r = weeklyCaps(w, [{ minutes: 150 }, { minutes: 160 }, { minutes: 170 }, { minutes: 180 }]);
    expect(total(r.week)).toBe(135);
    expect(r.changes[0]?.ruleId).toBe("G4");
  });

  const weeks = (...minutes: number[]) => minutes.map((m) => ({ minutes: m }));
  const w200 = [long("l", "", 70), hard("q", "", 60, { priority: 2 }), easy("e1", "", 35), easy("e2", "", 35)];

  it("reads the chronic load: one short week (deload, illness, skips) does not lower the next (G-9)", () => {
    expect(weeklyCaps(w200, weeks(200, 190, 200, 100)).changes).toEqual([]);
    expect(total(weeklyCaps(w200, weeks(100, 100, 100, 100)).week)).toBe(110);
  });

  it("never reads a return from a light week as three rising weeks, nor a fortnight after it (G-10)", () => {
    // Before: 180 a week; then an illness (60), and the return 120, 160, 190.
    expect(weeklyCaps(w200, weeks(180, 180, 180, 180, 60, 120, 160, 190)).changes).toEqual([]);
  });

  it("cuts easy runs to 30 min first, then the Q by a third at most, the long run last (G-11)", () => {
    const r = weeklyCaps(w200, weeks(150));
    expect(total(r.week)).toBe(165);
    expect([dur(r.week, "e1"), dur(r.week, "q"), dur(r.week, "l")]).toEqual([30, 40, 65]);
    // Only a hard cap that the floors cannot meet takes the easy runs and the long run further.
    const hardCap = trimTo(w200, 120, "G3").week;
    expect([dur(hardCap, "e1"), dur(hardCap, "q"), dur(hardCap, "l")]).toEqual([20, 40, 40]);
  });

  it("keeps the long run she already runs in a load week, G2 exceeded by its minutes above its share (G2b, G-13)", () => {
    const w = [long("l", "", 50), easy("e1", "", 30), easy("e2", "", 30)];
    expect(dur(weeklyCaps(w, weeks(90)).week, "l")).toBeCloseTo(39.6, 6);
    const kept = weeklyCaps(w, weeks(90), 50).week;
    expect(dur(kept, "l")).toBe(50);
    expect(total(kept)).toBeCloseTo(99 + 50 - 39.6, 6);
    // A hard cap (G3 here) never keeps it.
    expect(dur(weeklyCaps(w, weeks(30, 60, 90), 50).week, "l")).toBeLessThan(50);
  });

  it("never takes a threshold block under its 20 min: the next Q gives instead (G2b, P16, G-12)", () => {
    const w = [long("l", "", 70), hard("t", "", 24, { priority: 3 }), sixBy800("i"), easy("e", "", 30)];
    const r = trimTo(w, 175, "G2").week;
    expect(dur(r, "t")).toBe(20);
    expect(r.find((s) => s.id === "i")?.steps.find((st) => st.kind === "work")?.reps).toBe(4);
  });
});

describe("validateWeek (G8)", () => {
  it("refuses a Q on Monday and another on Tuesday (G-6)", () => {
    const r = validateWeek(week([hard("a", "2026-11-23T08:00"), hard("b", "2026-11-24T08:00")]));
    expect(r.ok).toBe(false);
    expect(r.violations).toContainEqual({ ruleId: "H4", sessionId: "b" });
  });

  it("refuses a Changer option above the planned load (G-7)", () => {
    const s = makeSession("T", [{ kind: "work", durMin: 30, target: { rpe: 8 } }], {
      id: "x",
      start: "2026-11-23T08:00",
    });
    expect(sessionLoad(s)).toBe(240);
    const r = validateWeek(week([s]), { plannedLoads: { x: 221 } });
    expect(r.violations).toEqual([{ ruleId: "CHANGE_LOAD", sessionId: "x" }]);
  });

  it("checks G1, G3 and P11, and skips manual sessions (H10)", () => {
    const qs = ["23", "25", "27"].map((d, i) => hard(`q${i}`, `2026-11-${d}T08:00`));
    expect(validateWeek(week(qs)).violations).toContainEqual({ ruleId: "P11", sessionId: "q2" });
    const l = long("l", "2026-11-29T09:00", 120);
    expect(validateWeek(week([l]), { longest30dMin: 80 }).violations).toContainEqual({ ruleId: "G1", sessionId: "l" });
    expect(validateWeek(week([l]), { last7dMin: 300, prev14dMin: 300 }).violations).toContainEqual({
      ruleId: "G3",
      sessionId: "",
    });
    const manual = [
      hard("a", "2026-11-23T08:00", 60, { manual: true }),
      hard("b", "2026-11-24T08:00", 60, { manual: true }),
    ];
    expect(validateWeek(week(manual)).ok).toBe(true);
  });
});

describe("returnAfterBreak and resumeWeek (G7)", () => {
  it("brings a 200 min week to 140 min without Q after 10 days off (G-8)", () => {
    const w = [long("l", "", 80), hard("q", "", 60), easy("e", "", 60)];
    const r = resumeWeek(w, 10);
    expect(total(r.week)).toBe(140);
    expect(r.week.filter((s) => isHard(s) && s.type !== "L")).toEqual([]);
  });

  it("follows the four bands", () => {
    expect([2, 4, 8, 20, 30].map((d) => returnAfterBreak(d).factor)).toEqual([1, 0.85, 0.7, 0.55, 0.45]);
    expect(resumeWeek([easy("e", "", 40)], 1).changes).toEqual([]);
  });
});

describe("distribution (P16)", () => {
  /** I session of 8 × 3 min + 130 min of E: Z3 = 24 / 200 = 12 %. */
  const intervals = makeSession(
    "I",
    [
      { kind: "warmup", durMin: 15, zone: "E", target: { paceSKm: [P40.E, P40.E], rpe: 3 } },
      { kind: "work", durMin: 3, reps: 8, zone: "I", target: { rpe: 8 } },
      { kind: "recover", durMin: 3, reps: 7, zone: "E", target: { rpe: 2 } },
      { kind: "cooldown", durMin: 10, zone: "E", target: { rpe: 3 } },
    ],
    { id: "i" },
  );
  const w = [intervals, long("l", "", 80), easy("e", "", 50)];

  it("removes fractions from the I until Z3 ≤ 10 % (P-15)", () => {
    expect(distributionCheck(w, "dev")).toMatchObject({ ok: false, z3: 0.12 });
    const r = enforceDistribution(w, "dev");
    expect(r.week[0]?.steps[1]?.reps).toBe(6);
    expect(distributionCheck(r.week, "dev").ok).toBe(true);
  });

  it("asks for 90 % easy time in base and stops when nothing can be removed", () => {
    expect(distributionCheck([sixBy800()], "base").ok).toBe(false);
    const t = enforceDistribution([hard("t", "", 60)], "dev").week;
    expect(dur(t, "t")).toBe(10);
  });

  it("shortens a continuous block and gives its minutes to an easy run (P-25)", () => {
    // 50 min at threshold, 80 min of long run and 40 min of E: 71 % easy; the E stays under 3/4 of the long run.
    const w = [hard("t", "", 50), long("l", "", 80), easy("e", "", 40)];
    expect(distributionCheck(w, "spe").ok).toBe(false);
    const r = enforceDistribution(w, "spe").week;
    expect(distributionCheck(r, "spe").ok).toBe(true);
    expect(total(r)).toBeCloseTo(170);
    expect(dur(r, "e")).toBeLessThanOrEqual(60);
    expect(dur(r, "e")).toBeGreaterThan(40);
  });

  it("cuts the long run's race-pace block, then SPE, before threshold, and threshold under 20 min last (P-38)", () => {
    const st = (
      kind: "warmup" | "work" | "recover" | "cooldown",
      durMin: number,
      zone: "E" | "T" | "race",
      rpe: number,
      reps?: number,
    ) => ({
      kind,
      durMin,
      zone,
      target: { rpe },
      ...(reps ? { reps } : {}),
    });
    const t = makeSession("T", [st("warmup", 15, "E", 3), st("work", 25, "T", 7), st("cooldown", 10, "E", 3)], {
      id: "t",
    });
    const spe = makeSession(
      "SPE",
      [st("warmup", 15, "E", 3), st("work", 20, "race", 6, 2), st("recover", 3, "E", 2), st("cooldown", 10, "E", 3)],
      { id: "s" },
    );
    const l = makeSession("L", [st("work", 70, "E", 4), st("work", 25, "race", 6)], { id: "l" });
    const e = makeSession("E", [st("work", 40, "E", 3)], { id: "e" });
    const r = enforceDistribution([t, spe, l, e], "spe").week;
    const work = (id: string, zone: string) =>
      r.find((s) => s.id === id)?.steps.find((x) => x.kind === "work" && x.zone === zone);
    expect(distributionCheck(r, "spe").ok).toBe(true);
    expect(work("t", "T")?.durMin).toBe(25);
    expect(work("l", "race")?.durMin).toBe(10);
    expect(dur(r, "l")).toBe(95);
    expect(work("s", "race")?.durMin).toBeLessThan(20);
    // Nothing else to cut: threshold gives under its floor so that 75 % stays easy.
    const alone = enforceDistribution(
      [makeSession("T", [st("work", 22, "T", 7)], { id: "t" }), easy("e", "", 40)],
      "dev",
    );
    expect(distributionCheck(alone.week, "dev").ok).toBe(true);
    expect(dur(alone.week, "t")).toBeLessThan(20);
  });

  it("leaves a test and the race out of the training distribution (P-26)", () => {
    const test = makeSession("TEST", [{ kind: "work", durMin: 20, zone: "race", target: { rpe: 9 } }], { id: "x" });
    expect(distributionCheck([test, long("l", "", 60), easy("e", "", 40)], "base").ok).toBe(true);
  });
});

describe("trainingLoad (G6)", () => {
  it("moves ATL faster than CTL", () => {
    const r = trainingLoad(Array(7).fill(300));
    expect(r.atl).toBeGreaterThan(r.ctl);
    expect(trainingLoad([])).toEqual({ ctl: 0, atl: 0 });
  });
});
