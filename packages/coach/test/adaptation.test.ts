import { describe, expect, it } from "vitest";
import type { Activity, FeelLog, Lap, Session } from "../src/index.ts";
import {
  adaptToRun,
  addDays,
  compareRun,
  dailySignals,
  dateOf,
  evaluateFeels,
  feelLog,
  logFeel,
  readRun,
} from "../src/index.ts";
import { blockDays, easy, hard, long, MONDAY, P40, SETTINGS, sixBy800, state } from "./fixtures.ts";

const HR_MAX = 190;
const TUE = addDays(MONDAY, 1);
const WED = addDays(MONDAY, 2);

/** A lap of `min` minutes at `paceSKm`. */
const lap = (min: number, paceSKm: number, avgHr = 0.72 * HR_MAX): Lap => ({
  durMin: min,
  distM: (min * 60_000) / paceSKm,
  avgHr,
});

const run = (id: string, start: string, laps: Lap[], extra: Partial<Activity> = {}): Activity => ({
  id,
  start,
  durMin: laps.reduce((s, l) => s + l.durMin, 0),
  distM: laps.reduce((s, l) => s + l.distM, 0),
  laps,
  ...extra,
});

/** 15 min easy, 20 min at threshold, 10 min easy: a tempo in place of a 45 min footing. */
const tempo = (start: string): Activity => run("tempo", start, [lap(15, P40.E), lap(20, P40.T), lap(10, P40.E)]);
const footing = (start: string, min = 45, pace = P40.E): Activity => run("footing", start, [lap(min, pace)]);

describe("readRun (AD1)", () => {
  it("reads an easy run as easy, a tempo as a hard day, threshold heart rate as threshold (AD-1, AD-2)", () => {
    const e = readRun(footing(`${TUE}T18:00`), P40, HR_MAX);
    expect(e).toMatchObject({ minutes: 45, fastMin: 0, hard: false, load: 135, rpe: 3 });
    const t = readRun(tempo(`${TUE}T18:00`), P40, HR_MAX);
    expect(t.fastMin).toBe(20);
    expect(t.hard).toBe(true);
    expect(t.load).toBe(25 * 3 + 20 * 7);
    // A hilly or hot run: easy pace, but 20 min at 90 % of HRmax is a threshold effort.
    const hot = run("hot", `${TUE}T18:00`, [lap(15, P40.E), lap(20, P40.E, 0.9 * HR_MAX), lap(10, P40.E)]);
    expect(readRun(hot, P40, HR_MAX).hard).toBe(true);
    expect(readRun(hot, P40).hard).toBe(false);
  });

  it("reads the whole run when the laps are missing or glitched, and a run longer than any footing as hard", () => {
    const glitch = { ...footing(`${TUE}T18:00`), laps: [{ durMin: 1, distM: 1000 }] };
    expect(readRun(glitch, P40).fastMin).toBe(0);
    expect(readRun(footing(`${TUE}T18:00`, 80), P40).hard).toBe(true);
  });
});

describe("compareRun (AD2)", () => {
  const e = easy("e", `${TUE}T18:00`, 45);
  const read = (a: Activity) => readRun(a, P40, HR_MAX);
  it("names what she did against the plan (AD-3)", () => {
    expect(compareRun(e, read(tempo(e.start)), P40)).toBe("other_type");
    expect(compareRun(e, read(footing(e.start, 45, P40.M)), P40)).toBe("harder");
    expect(compareRun(e, read(footing(e.start, 30)), P40)).toBe("shorter");
    expect(compareRun(e, read(footing(e.start, 60)), P40)).toBe("longer");
    expect(compareRun(e, read(footing(e.start, 47)), P40)).toBe("as_planned");
    expect(compareRun(null, read(footing(e.start)), P40)).toBe("extra");
    expect(compareRun(sixBy800("q", e.start), read(footing(e.start, 52)), P40)).toBe("other_type");
    expect(compareRun(long("l", e.start, 90), read(footing(e.start, 90)), P40)).toBe("as_planned");
    // 60 min at threshold planned, 15 min of it run: still a quality run, a much easier one.
    const short = run("t", e.start, [lap(15, P40.T), lap(45, P40.E)]);
    expect(compareRun(hard("t", e.start, 60), read(short), P40)).toBe("easier");
  });
});

describe("adaptToRun (M10)", () => {
  const plannedE = easy("e", `${TUE}T18:00`, 45, { status: "done" });
  const ctx = { sessionId: "e", history: [], hrMax: HR_MAX };

  it("moves the hard session the day after a tempo run in place of a footing (AD3, AD-4)", () => {
    const q = hard("q", `${WED}T18:00`, 50);
    const r = adaptToRun(state([plannedE, q], []), tempo(plannedE.start), `${TUE}T19:00`, ctx);
    expect(r.deviation).toBe("other_type");
    const moved = r.state.sessions.find((s) => s.id === "q");
    expect(dateOf(moved?.start ?? "") >= addDays(TUE, 2)).toBe(true);
    expect(moved?.type).toBe("T");
    expect(r.changes).toEqual([expect.objectContaining({ ruleId: "AD3", sessionId: "q" })]);
  });

  it("lightens it instead within 12 h (H9) or when no day is left, never the long run (AD-5, AD-6)", () => {
    const early = hard("q", `${WED}T07:00`, 50);
    const soon = adaptToRun(state([plannedE, early], []), tempo(plannedE.start), `${TUE}T20:00`, ctx);
    expect(soon.state.sessions.find((s) => s.id === "q")).toMatchObject({ type: "E", durMin: 50, start: early.start });
    const q = hard("q", `${WED}T18:00`, 50);
    const full = blockDays([4, 5, 6].map((d) => addDays(MONDAY, d)).concat(addDays(MONDAY, 3)));
    const blocked = adaptToRun(state([plannedE, q], full), tempo(plannedE.start), `${TUE}T19:00`, ctx);
    expect(blocked.state.sessions.find((s) => s.id === "q")).toMatchObject({ type: "E", start: q.start });
    const l = long("l", `${WED}T18:00`, 90);
    const kept = adaptToRun(state([plannedE, l], full), tempo(plannedE.start), `${TUE}T19:00`, ctx);
    expect(kept.changes).toEqual([]);
  });

  it("changes nothing for a run as planned, easier or shorter: nothing is made up (AD5, AD-7)", () => {
    const q = hard("q", `${WED}T18:00`, 50);
    for (const a of [footing(plannedE.start), footing(plannedE.start, 25), footing(plannedE.start, 45, P40.E + 60)]) {
      const r = adaptToRun(state([plannedE, q], []), a, `${TUE}T19:00`, ctx);
      expect(r.changes).toEqual([]);
      expect(r.state.sessions).toEqual([plannedE, q]);
    }
  });

  it("counts a run she added in the week: the footings ahead shrink to their floor under G2 (AD4, AD-8)", () => {
    // 4 weeks at 160 min: 176 min this week at most. Monday 45 + Wednesday's 40 added + Sunday's long run 60 leave 31.
    const history = [1, 2, 3, 4].map((k) => footing(`${addDays(MONDAY, -7 * k)}T18:00`, 160));
    const done = { ...easy("mon", `${MONDAY}T18:00`, 45), status: "done" as const };
    const fri = easy("fri", `${addDays(MONDAY, 4)}T18:00`, 45);
    const sun = long("sun", `${addDays(MONDAY, 6)}T10:00`, 60);
    const ran = [{ ...footing(done.start), id: "mon" }];
    const extra = { ...footing(`${WED}T12:00`, 40), id: "extra" };
    const r = adaptToRun(state([done, fri, sun], []), extra, `${WED}T13:00`, {
      history: [...history, ...ran],
      hrMax: HR_MAX,
    });
    expect(r.deviation).toBe("extra");
    expect(r.state.sessions.find((s) => s.id === "fri")?.durMin).toBe(31);
    expect(r.state.sessions.find((s) => s.id === "sun")?.durMin).toBe(60);
    expect(r.changes).toEqual([expect.objectContaining({ ruleId: "AD4", sessionId: "fri" })]);
    // A new runner has no chronic load: nothing to compare with.
    expect(adaptToRun(state([done, fri, sun], []), extra, `${WED}T13:00`, { history: [] }).changes).toEqual([]);
  });
});

describe("feelLog (C3 with the run, AD1)", () => {
  const e: Session = easy("e", `${TUE}T18:00`, 45);

  it("keeps a tempo she chose out of the fatigue signal: an easy run felt hard is SG4 only if she ran it easy (AD-9)", () => {
    const chose = feelLog(e, tempo(e.start), "hard", P40, HR_MAX);
    expect(chose.rpeDone).toBeGreaterThan(4);
    const tired = feelLog(e, footing(e.start), "hard", P40, HR_MAX);
    const ctx = { cal: [], sick: [], settings: { ...SETTINGS, useSleepHr: false } };
    const sg4 = (f: FeelLog) => dailySignals({ date: WED }, [], { ...ctx, lastFeels: [f] }).signals;
    expect(sg4(chose)).toEqual([]);
    expect(sg4(tired)).toEqual(["SG4"]);
  });

  it("stores what she ran when the run is given to logFeel", () => {
    const r = logFeel(state([e]), "e", "easy", footing(e.start, 45, P40.E - 20));
    expect(r.state.feels[0]?.paceRatio).toBeGreaterThan(1.03);
    expect(logFeel(state([e]), "e", "easy").state.feels[0]?.paceRatio).toBeUndefined();
  });
});

describe("evaluateFeels: too easy (RC13)", () => {
  const feels = (ratio: number, feel: FeelLog["feel"] = "easy"): FeelLog[] =>
    [0, 2, 4].map((d) => ({
      sessionId: `s${d}`,
      date: addDays(MONDAY, d),
      feel,
      rpeTarget: 3,
      rpeDone: 3,
      paceRatio: ratio,
    }));
  const now = `${addDays(MONDAY, 4)}T20:00`;

  it("proposes a test after three easy runs felt easy and run 3 % faster than their target (RC-23)", () => {
    expect(evaluateFeels(feels(1.04), 40, now)).toMatchObject({ kind: "test", ruleId: "RC13", from: 40, to: 40 });
    expect(evaluateFeels(feels(1.01), 40, now)).toBeNull();
    expect(evaluateFeels(feels(1.04, "ok"), 40, now)).toBeNull();
  });

  it("proposes it once in 14 days (RC8), and never reads a hard tempo as an easy run felt hard (RC5)", () => {
    const past = evaluateFeels(feels(1.04), 40, now);
    if (!past) throw new Error("expected a proposal");
    const history = [{ proposal: past, decision: "refused" as const, on: dateOf(now) }];
    expect(evaluateFeels(feels(1.04), 40, now, { history })).toBeNull();
    const tempos = feels(1.1, "hard").map((f) => ({ ...f, rpeDone: 5 }));
    expect(evaluateFeels(tempos, 40, now)).toBeNull();
  });
});
