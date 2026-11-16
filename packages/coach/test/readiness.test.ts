import { describe, expect, it } from "vitest";
import type { DailySignal, ReadinessCtx, SignalId } from "../src/index.ts";
import { addDays, baseline, dailyDecision, dailySignals, decisionDue, isConfirmed } from "../src/index.ts";
import { block, easy, hard, SETTINGS } from "./fixtures.ts";

const TODAY = "2026-11-25";
const NOW = `${TODAY}T07:30`;

/** n days before today, alternating two values: RHR μ 52 σ ≈ 2, sleep median 450 σ ≈ 40, BB μ 70 σ ≈ 10, stress μ 30 σ ≈ 6. */
function history(n = 28, rhr: [number, number] = [50, 54]): DailySignal[] {
  return [...Array(n).keys()].map((i) => {
    const odd = i % 2 === 1;
    return {
      date: addDays(TODAY, -(n - i)),
      rhr: odd ? rhr[1] : rhr[0],
      sleepMin: odd ? 490 : 410,
      bodyBatteryWake: odd ? 80 : 60,
      stressAvg: odd ? 36 : 24,
    };
  });
}

const normal: DailySignal = { date: TODAY, rhr: 52, sleepMin: 450, bodyBatteryWake: 70, stressAvg: 30 };
const ctx: ReadinessCtx = { lastFeels: [], cal: [], sick: [], settings: SETTINGS };
const signals = (today: Partial<DailySignal>, h = history(), c = ctx) => dailySignals({ ...normal, ...today }, h, c);
const q = hard("q", `${TODAY}T18:00`);
const e = easy("e", `${TODAY}T18:00`);

describe("baseline (B1)", () => {
  it("uses the 28 days before today, without sick days", () => {
    const b = baseline(
      history().map((h) => ({ date: h.date, v: h.rhr })),
      [addDays(TODAY, -1)],
      NOW,
    );
    expect(b?.n).toBe(27);
    expect(b?.mean).toBeCloseTo(51.93, 2);
  });

  it("is null without values and has a zero deviation with one", () => {
    expect(baseline([], [], NOW)).toBeNull();
    expect(baseline([{ date: addDays(TODAY, -1), v: 50 }], [], NOW)).toEqual({ mean: 50, sd: 0, median: 50, n: 1 });
  });
});

describe("dailySignals and dailyDecision (M5)", () => {
  it("keeps a Q on a single raised RHR (RD-1)", () => {
    const s = signals({ rhr: 57 });
    expect(s.signals).toEqual(["SG1"]);
    expect(dailyDecision(q, s.signals, [], NOW).action).toBe("keep");
  });

  it("makes a Q easier on RHR and short sleep (RD-2)", () => {
    const s = signals({ rhr: 57, sleepMin: 310 });
    expect(s.signals).toEqual(["SG1", "SG2"]);
    expect(dailyDecision(q, s.signals, [], NOW)).toEqual({ action: "easier", frozen: true, ruleIds: ["D3"] });
  });

  it("confirms the same signal two days running (RD-3)", () => {
    expect(isConfirmed(["SG1"], ["SG1"])).toBe(true);
    expect(dailyDecision(q, ["SG1"], ["SG1"], NOW).action).toBe("easier");
  });

  it("shortens an easy run on three signals (RD-4)", () => {
    expect(dailyDecision(e, ["SG1", "SG2", "SG3"], null, NOW).action).toBe("shorter");
    expect(dailyDecision(e, ["SG1", "SG2"], null, NOW).action).toBe("keep");
  });

  it("proposes rest from four signals (RD-5)", () => {
    expect(dailyDecision(e, ["SG1", "SG2", "SG3", "SG4"], null, NOW).action).toBe("proposeRest");
  });

  it("counts Body Battery and stress as one Garmin signal (RD-6)", () => {
    const s = signals({ bodyBatteryWake: 45, stressAvg: 45 });
    expect(s.signals).toEqual(["SG3"]);
    expect(dailyDecision(q, s.signals, null, NOW).action).toBe("keep");
  });

  it("uses the +5 bpm default with 10 days of history (RD-7)", () => {
    const s = signals({ rhr: 56 }, history(10));
    expect(s.signals).not.toContain("SG1");
    expect(s.usedDefaults).toContain("SG1");
    expect(signals({ rhr: 57 }, history(10)).signals).toContain("SG1");
  });

  it("ignores RHR and uses the 6 h sleep default with 5 days (RD-8)", () => {
    const s = signals({ rhr: 70, sleepMin: 340 }, history(5));
    expect(s.signals).toEqual(["SG2"]);
    expect(s.usedDefaults).toEqual(["SG1", "SG2", "SG3"]);
    expect(dailyDecision(q, s.signals, null, NOW).action).toBe("keep");
  });

  it("decides with what is present when nothing synced (RD-9)", () => {
    const s = dailySignals({ date: TODAY }, history(), ctx);
    expect(s.missing).toEqual(["SG1", "SG2", "SG3"]);
    expect(dailyDecision(q, s.signals, null, NOW).action).toBe("keep");
  });

  it("leaves a session moved by hand alone (RD-10)", () => {
    expect(dailyDecision({ ...q, manual: true }, ["SG1", "SG2"], null, NOW).action).toBe("none");
  });

  it("never changes a session again once decided (RD-11)", () => {
    expect(dailyDecision({ ...q, frozen: true }, ["SG2", "SG1"], null, `${TODAY}T14:00`)).toMatchObject({
      action: "none",
      ruleIds: ["D7"],
    });
  });

  it("floors the RHR deviation at 1.5 bpm, so the threshold is μ + 3 (RD-12)", () => {
    const tight = history(28, [51.5, 52.5]);
    expect(signals({ rhr: 55 }, tight).signals).toContain("SG1");
    expect(signals({ rhr: 54.9 }, tight).signals).not.toContain("SG1");
  });

  it("flags three short nights against the median", () => {
    // The two last nights drop to 385 min; two old short nights become long ones so the median stays 450.
    const h = history().map((d, i, all) =>
      i >= all.length - 2 ? { ...d, sleepMin: 385 } : i === 0 || i === 2 ? { ...d, sleepMin: 490 } : d,
    );
    expect(signals({ sleepMin: 385 }, h).signals).toContain("SG2");
  });

  it("reads a hard feel on an easy session and an exam tomorrow (SG4, SG5)", () => {
    const c: ReadinessCtx = {
      ...ctx,
      lastFeels: [{ sessionId: "x", date: addDays(TODAY, -1), feel: "hard", rpeTarget: 3 }],
      cal: [block("x", `${addDays(TODAY, 1)}T08:00`, `${addDays(TODAY, 1)}T10:00`, "exam")],
    };
    expect(signals({}, history(), c).signals).toEqual(["SG4", "SG5"]);
  });

  it("only counts feel and exams when the sleep and HR switch is off (D8)", () => {
    const off = { ...ctx, settings: { ...SETTINGS, useSleepHr: false } };
    const s = signals({ rhr: 70, sleepMin: 200 }, history(), off);
    expect([...s.signals, ...s.missing]).toEqual([]);
  });

  it("does nothing without a session or once it has started", () => {
    expect(dailyDecision(null, ["SG1"], null, NOW).action).toBe("none");
    expect(dailyDecision(q, ["SG1", "SG2"], null, `${TODAY}T18:30`).action).toBe("none");
  });
});

describe("decisionDue (D1)", () => {
  it("decides at the night sync, or at min(10:00, session - 2 h)", () => {
    expect(decisionDue(NOW, null, true)).toBe(true);
    expect(decisionDue(`${TODAY}T09:59`, null, false)).toBe(false);
    expect(decisionDue(`${TODAY}T10:00`, null, false)).toBe(true);
    expect(decisionDue(`${TODAY}T06:00`, `${TODAY}T08:00`, false)).toBe(true);
  });
});

describe("isConfirmed (D2)", () => {
  it("needs two signals or a repeated one", () => {
    const none: SignalId[] = [];
    expect(isConfirmed(["SG1"], ["SG2"])).toBe(false);
    expect(isConfirmed(["SG1", "SG5"], none)).toBe(true);
    expect(isConfirmed(["SG1"], null)).toBe(false);
  });
});
