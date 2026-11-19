import { describe, expect, it } from "vitest";
import type { BuildCtx, RunType, Session, Step } from "../src/index.ts";
import {
  buildSession,
  downgrade,
  equivalents,
  feelToRpe,
  isHard,
  makeSession,
  paces,
  repace,
  scaleSession,
  sessionLoad,
  toEasy,
  workMin,
} from "../src/index.ts";
import { P40, sixBy800 } from "./fixtures.ts";

const ctx: BuildCtx = { weeklyMin: 200, paces: P40, phase: "dev", progressionStep: 0, distM: 21097.5 };
const work = (s: Session): Step[] => s.steps.filter((st) => st.kind === "work");
const st = (kind: Step["kind"], durMin: number, rpe: number, reps?: number): Step => ({
  kind,
  durMin,
  target: { rpe },
  ...(reps ? { reps } : {}),
});

describe("buildSession (C1)", () => {
  it("sizes a T to 15 continuous minutes for 200 min/week at VDOT 40 (C-1)", () => {
    const t = buildSession("T", ctx);
    expect(work(t).map((s) => s.durMin)).toEqual([15]);
    expect(t.steps.map((s) => s.kind)).toEqual(["warmup", "work", "cooldown"]);
    expect(t.durMin).toBe(40);
  });

  it("builds sprints on the flat inside an easy run, in place of hill sprints (C-9)", () => {
    const h = buildSession("E", { ...ctx, phase: "base", durMin: 48, sprints: true });
    expect(h.type).toBe("E");
    expect(h.steps.map((s) => s.kind)).toEqual(["warmup", "strides", "recover", "cooldown"]);
    expect(h.steps[1]).toMatchObject({ reps: 6, durMin: 10 / 60, zone: "R", target: { rpe: 8 } });
    expect(h.steps[1]?.target.paceSKm).toEqual([ctx.paces.R, ctx.paces.R]);
    expect(h.steps[2]).toMatchObject({
      reps: 5,
      durMin: 1.5,
      zone: "E",
      target: { paceSKm: [ctx.paces.E, ctx.paces.E] },
    });
    expect(h.durMin).toBeLessThanOrEqual(48);
    expect(isHard(h)).toBe(false);
  });

  it("sizes an I to 4 × 3 min with 3 min recoveries (C-2)", () => {
    const i = buildSession("I", ctx);
    expect(work(i)[0]).toMatchObject({ reps: 4, durMin: 3 });
    expect(i.steps.find((s) => s.kind === "recover")).toMatchObject({ reps: 3, durMin: 3 });
  });

  it("progresses T to 20 min and CRUISE from 3 × 5 to 2 × 15", () => {
    const big = { ...ctx, weeklyMin: 400 };
    expect(work(buildSession("T", { ...big, progressionStep: 2 }))[0]?.durMin).toBe(20);
    expect(work(buildSession("CRUISE", big))[0]).toMatchObject({ reps: 3, durMin: 5 });
    expect(work(buildSession("CRUISE", { ...big, progressionStep: 5 }))[0]).toMatchObject({ reps: 2, durMin: 15 });
  });

  it("builds every type with a positive duration and the catalogue RPE", () => {
    const types: RunType[] = ["E", "RECUP", "L", "T", "CRUISE", "I", "R", "SPE", "FARTLEK", "TEST"];
    for (const t of types) {
      const s = buildSession(t, ctx);
      expect(s.durMin).toBeGreaterThan(0);
      expect(s.type).toBe(t);
    }
    expect(buildSession("RECUP", ctx).rpeTarget).toBe(2);
    expect(buildSession("TEST", ctx).rpeTarget).toBe(9);
  });

  it("adds strides to an E on request", () => {
    expect(buildSession("E", { ...ctx, strides: true }).steps.at(-1)).toMatchObject({ kind: "strides", reps: 6 });
  });

  it("puts a race-pace block in the long run every other specific week (semi, marathon)", () => {
    const spe = { ...ctx, phase: "spe" as const, durMin: 100, racePaceSKm: 320 };
    expect(work(buildSession("L", spe)).map((s) => s.zone)).toEqual(["E", "race"]);
    expect(work(buildSession("L", { ...spe, progressionStep: 1 })).map((s) => s.zone)).toEqual(["E"]);
  });

  it("uses marathon pace blocks for a marathon SPE and km blocks for a half", () => {
    const m = buildSession("SPE", { ...ctx, distM: 42195, weeklyMin: 300 });
    expect(work(m)[0]?.target.paceSKm).toEqual([P40.M, P40.M]);
    expect(work(buildSession("SPE", ctx))[0]).toMatchObject({ reps: 2, distM: 3000 });
  });
});

describe("sessionLoad and isHard", () => {
  it("adds duration × RPE of each step (C-8)", () => {
    const s = makeSession("CRUISE", [
      st("warmup", 15, 3),
      st("work", 5, 7, 4),
      st("recover", 1, 2, 3),
      st("cooldown", 10, 3),
    ]);
    expect(sessionLoad(s)).toBe(221);
  });

  it("classifies L, E + strides, a 5 min fartlek and 2.4 km of R (C-3)", () => {
    const l = buildSession("L", { ...ctx, durMin: 75 });
    const strides = buildSession("E", { ...ctx, strides: true });
    const fartlek = makeSession("FARTLEK", [
      { ...st("work", 30, 3), zone: "E" },
      { ...st("work", 1, 6, 5), zone: "T" },
    ]);
    const r = makeSession("R", [{ ...st("work", 1.5, 8, 6), distM: 400, zone: "R" }]);
    expect([l, strides, fartlek, r].map(isHard)).toEqual([true, false, false, false]);
  });

  it("counts R from 3 km and a fartlek above 6 fast minutes as hard", () => {
    expect(isHard(makeSession("R", [{ ...st("work", 1.5, 8, 8), distM: 400 }]))).toBe(true);
    expect(isHard(makeSession("FARTLEK", [{ ...st("work", 1, 6, 8), zone: "T" }]))).toBe(true);
  });
});

describe("equivalents (C2)", () => {
  it("turns 6 × 800 m at I into 7 × 3 min with 3 min recoveries, never above the planned load (C-4)", () => {
    const planned = sixBy800();
    const [eq] = equivalents(planned, P40);
    expect(eq && work(eq)[0]).toMatchObject({ reps: 7, durMin: 3 });
    expect(eq?.steps.find((s) => s.kind === "recover")).toMatchObject({ durMin: 3 });
    expect(eq && sessionLoad(eq)).toBeLessThanOrEqual(sessionLoad(planned));
  });

  it("has no equivalent for a long run (C-5)", () => {
    expect(equivalents(buildSession("L", { ...ctx, durMin: 90 }), P40)).toEqual([]);
  });

  it("turns a continuous 20 min T (140 AU) into CRUISE 2 × 9 min with 2 min recovery (20 min, 130 AU) (C-6)", () => {
    const t = makeSession("T", [st("warmup", 15, 3), { ...st("work", 20, 7), zone: "T" }, st("cooldown", 10, 3)]);
    const [eq] = equivalents(t, P40);
    expect(eq?.type).toBe("CRUISE");
    expect(eq && work(eq)[0]).toMatchObject({ reps: 2, durMin: 9 });
    expect(eq?.steps.find((s) => s.kind === "recover")).toMatchObject({ durMin: 2 });
    const wrap = 15 * 3 + 10 * 3;
    expect(eq && sessionLoad(eq) - wrap).toBe(130);
    expect(eq && eq.durMin - 25).toBe(20);
  });

  it("turns CRUISE back into a continuous T and SPE into shorter blocks", () => {
    const cruise = buildSession("CRUISE", { ...ctx, weeklyMin: 400 });
    expect(equivalents(cruise, P40)[0]?.type).toBe("T");
    const spe = buildSession("SPE", ctx);
    const [eq] = equivalents(spe, P40);
    expect(eq && work(eq)[0]?.reps).toBe(4);
    expect(eq && sessionLoad(eq)).toBeLessThanOrEqual(sessionLoad(spe));
  });

  it("steps one notch down when no I form fits", () => {
    const tiny = makeSession("I", [{ ...st("work", 2, 8, 2), zone: "I" }]);
    const eq = equivalents(tiny, P40);
    expect(eq.map((s) => s.type)).toEqual(["T"]);
  });

  it("offers nothing for easy runs", () => {
    expect(equivalents(buildSession("E", ctx), P40)).toEqual([]);
  });
});

describe("feelToRpe (C3)", () => {
  it("shifts by two and stays within 1 to 10 (C-7)", () => {
    expect([feelToRpe("hard", 3), feelToRpe("easy", 2), feelToRpe("hard", 9), feelToRpe("ok", 5)]).toEqual([
      5, 1, 10, 5,
    ]);
  });
});

describe("session transforms", () => {
  it("scales fractions down with a floor of two", () => {
    expect(work(scaleSession(sixBy800(), 0.75))[0]?.reps).toBe(4);
    expect(work(scaleSession(sixBy800(), 0.1))[0]?.reps).toBe(2);
  });

  it("scales a continuous run to the nearest 5 min", () => {
    expect(scaleSession(buildSession("E", ctx), 0.75, 5).durMin).toBe(35);
  });

  it("makes an easy run of the same moment, never above the original RPE", () => {
    const recup = buildSession("RECUP", { ...ctx, durMin: 25 });
    const jog = toEasy(recup, 20, "rpe");
    expect(jog).toMatchObject({ type: "RECUP", durMin: 20, rpeTarget: 2, pilot: "rpe" });
    expect(toEasy(buildSession("I", ctx), 50).type).toBe("E");
  });

  it("gives every running step a pace, a race day turned easy included (C-10)", () => {
    for (const type of ["E", "L", "T", "CRUISE", "I", "R", "SPE", "FARTLEK", "TEST", "RACE"])
      for (const s of buildSession(type as RunType, { ...ctx, strides: true }).steps)
        expect(s.target.paceSKm, `${type} ${s.kind}`).toBeDefined();
    const easy = toEasy(buildSession("RACE", { ...ctx, distM: 21097.5, racePaceSKm: 311 }), 30);
    expect(easy.steps[0]?.target.paceSKm?.[0]).toBeGreaterThan(311);
  });

  it("downgrades I to T and T to fartlek at equal work time", () => {
    const i = buildSession("I", ctx);
    expect(downgrade(i, P40)).toMatchObject({ type: "T" });
    expect(workMin(downgrade(i, P40))).toBe(Math.floor(workMin(i)));
    expect(downgrade(buildSession("T", ctx), P40).type).toBe("FARTLEK");
  });

  it("gives each step one target pace, a recovery run 15 s/km under E, kept by a new level (C4)", () => {
    const recup = buildSession("RECUP", { ...ctx, durMin: 30 });
    expect(recup.steps[0]?.target.paceSKm).toEqual([P40.E + 15, P40.E + 15]);
    expect(repace(recup, paces(45)).steps[0]?.target.paceSKm).toEqual([paces(45).E + 15, paces(45).E + 15]);
    expect(buildSession("L", ctx).steps[0]?.target.paceSKm).toEqual([P40.E, P40.E]);
  });

  it("applies new paces and resizes distance fractions", () => {
    const after = repace(sixBy800(), paces(45));
    const w = work(after)[0];
    expect(w?.target.paceSKm).toEqual([paces(45).I, paces(45).I]);
    expect(w?.durMin).toBeCloseTo((0.8 * paces(45).I) / 60, 6);
  });
});
