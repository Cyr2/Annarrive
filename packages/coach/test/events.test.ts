import { describe, expect, it } from "vitest";
import type { Health, Session, Step } from "../src/index.ts";
import {
  adaptForHealth,
  applyChange,
  changeOptions,
  confirmDone,
  detectMissed,
  feelBetter,
  logFeel,
  makeSession,
  moveSession,
  onTimetableChange,
  reportUnavailable,
  skipSession,
  slotAt,
  updateSettings,
  weekDates,
} from "../src/index.ts";
import { block, blockDays, easy, hard, LEGS, long, MONDAY, P40, sixBy800, state } from "./fixtures.ts";

const work = (s: Session | undefined): Step | undefined => s?.steps.find((st) => st.kind === "work");
const byId = (sessions: Session[], id: string): Session | undefined => sessions.find((s) => s.id === id);
const MON_8 = "2026-11-23T08:00";

describe("moveSession (EV1)", () => {
  const q = sixBy800("q", "2026-11-26T18:00");

  it("moves a Q to a valid slot and marks it manual (EV-1)", () => {
    const r = moveSession(state([q]), "q", slotAt(q, "2026-11-25T19:30"), MON_8);
    expect(r.ok).toBe(true);
    expect(byId(r.state.sessions, "q")).toMatchObject({ start: "2026-11-25T19:30", manual: true, type: "I" });
    expect(r.changes).toEqual([expect.objectContaining({ ruleId: "EV1", sessionId: "q" })]);
    expect(r.previous.sessions[0]?.start).toBe("2026-11-26T18:00");
  });

  it("accepts a forced slot breaking H5 but turns the Q into an E of the same duration (EV-2)", () => {
    const r = moveSession(state([q]), "q", slotAt(q, "2026-11-25T17:00"), MON_8);
    const after = byId(r.state.sessions, "q");
    expect(after).toMatchObject({ type: "E", durMin: q.durMin, manual: true });
    expect(r.warnings[0]?.message).toBe("Moins de 24 h après ta séance jambes");
  });

  it("refuses a slot inside the calendar or in the past", () => {
    expect(moveSession(state([q]), "q", slotAt(q, "2026-11-24T18:00"), MON_8)).toMatchObject({
      ok: false,
      changes: [],
    });
    expect(moveSession(state([q]), "q", slotAt(q, "2026-11-23T07:00"), MON_8).ok).toBe(false);
  });

  it("rejects an unknown session", () => {
    expect(() => moveSession(state([]), "x", slotAt(q, "2026-11-25T19:30"), MON_8)).toThrow("Unknown session");
  });
});

describe("changeOptions and applyChange (EV2 to EV6)", () => {
  it("offers 4 × 800 m, the same time easy, 7 × 3 min and 30 min of E (EV-3)", () => {
    const o = changeOptions(state([sixBy800("q", "2026-11-26T18:00")]), "q");
    expect(work(o.shorter)?.reps).toBe(4);
    expect(o.easier).toMatchObject({ type: "E", durMin: sixBy800().durMin });
    expect(work(o.equivalent)).toMatchObject({ reps: 7, durMin: 3 });
    expect(o.jog30).toMatchObject({ type: "E", durMin: 30 });
  });

  it("caps the jog at the planned duration and offers no equivalent for RECUP (EV-4)", () => {
    const recup = makeSession("RECUP", [{ kind: "work", durMin: 25, zone: "E", target: { paceSKm: P40.E, rpe: 2 } }], {
      id: "r",
      start: "2026-11-26T18:00",
    });
    const o = changeOptions(state([recup]), "r");
    expect(o.jog30.durMin).toBe(25);
    expect(o.equivalent).toBeUndefined();
  });

  it("applies an option as a manual change that stays within the planned load (EV6)", () => {
    const r = applyChange(state([sixBy800("q", "2026-11-26T18:00")]), "q", "equivalent", MON_8);
    expect(r.ok).toBe(true);
    expect(byId(r.state.sessions, "q")?.manual).toBe(true);
    expect(r.changes[0]?.ruleId).toBe("CHANGE_equivalent");
  });

  it("refuses a missing option or a past session", () => {
    const st = state([easy("e", "2026-11-26T18:00")]);
    expect(applyChange(st, "e", "equivalent", MON_8).ok).toBe(false);
    expect(applyChange(st, "e", "shorter", "2026-11-27T08:00").ok).toBe(false);
  });
});

describe("reportUnavailable: no time (EV7)", () => {
  it("proposes three slots and changes nothing before a choice (EV-5)", () => {
    const st = state([easy("e", "2026-11-23T18:00")]);
    const r = reportUnavailable(st, { reason: "no_time" }, MON_8);
    expect(r.proposals?.[0]?.slots).toHaveLength(3);
    expect(r.state).toBe(st);
    expect(r.changes).toEqual([]);
  });

  it("skips the session when nothing fits, adding nothing elsewhere (EV-6)", () => {
    const st = state([easy("e", "2026-11-23T18:00")], blockDays(weekDates(MONDAY)));
    const r = reportUnavailable(st, { reason: "no_time" }, MON_8);
    expect(r.state.sessions).toHaveLength(1);
    expect(r.state.sessions[0]?.status).toBe("skipped");
  });

  it("does nothing without a session today", () => {
    expect(reportUnavailable(state([]), { reason: "no_time" }, MON_8).changes).toEqual([]);
  });
});

describe("reportUnavailable: tired (EV8)", () => {
  it("rests today and shortens tomorrow's Q by 25 % (EV-7)", () => {
    const st = state([easy("e", "2026-11-23T18:00"), sixBy800("q", "2026-11-24T08:00")]);
    const r = reportUnavailable(st, { reason: "tired" }, MON_8);
    expect(byId(r.state.sessions, "e")?.status).toBe("skipped");
    expect(work(byId(r.state.sessions, "q"))?.reps).toBe(4);
  });

  it("leaves a Q three days away untouched (EV-8)", () => {
    const st = state([easy("e", "2026-11-23T18:00"), sixBy800("q", "2026-11-26T18:00")]);
    const r = reportUnavailable(st, { reason: "tired" }, MON_8);
    expect(work(byId(r.state.sessions, "q"))?.reps).toBe(6);
  });

  it("rests until the date, then applies G7", () => {
    const st = state([
      easy("e", "2026-11-23T18:00"),
      easy("e2", "2026-11-25T18:00"),
      sixBy800("q", "2026-11-27T18:00"),
    ]);
    const r = reportUnavailable(st, { reason: "tired", until: "2026-11-25" }, MON_8);
    expect(byId(r.state.sessions, "e2")?.status).toBe("skipped");
    expect(byId(r.state.sessions, "q")?.durMin).toBeLessThan(sixBy800().durMin);
  });
});

describe("health: advise, never block (EV9 to EV13)", () => {
  const sick: Health = { kind: "sick", since: "2026-11-23" };

  it("advises rest when sick, and turns a 45 min E into 22 min at RPE ≤ 3 if she runs on day 2 (EV-9)", () => {
    const st = state([easy("e", "2026-11-23T18:00")]);
    const r = reportUnavailable(st, { reason: "sick", feverOrChest: true }, MON_8);
    expect(r.state.health.kind).toBe("sick");
    expect(r.warnings[0]?.ruleId).toBe("EV9");
    expect(r.state.sessions[0]?.status).toBe("planned");
    const day2 = adaptForHealth(easy("e2", "2026-11-24T18:00"), sick, "2026-11-24", P40);
    expect(day2).toMatchObject({ type: "E", durMin: 22 });
    expect(day2.rpeTarget).toBeLessThanOrEqual(3);
    expect(adaptForHealth(sixBy800("q", "2026-11-25T18:00"), sick, "2026-11-25", P40).type).toBe("E");
  });

  it("returns with easy runs for 3 days, then the first Q one notch easier", () => {
    const r = feelBetter(state([], [], { health: sick }), "2026-11-27T08:00");
    const h = r.state.health;
    expect(h).toEqual({ kind: "recovering", easyUntil: "2026-11-30", qEasierUntil: "2026-12-07" });
    expect(adaptForHealth(sixBy800("q", ""), h, "2026-11-29", P40).type).toBe("E");
    expect(adaptForHealth(sixBy800("q", ""), h, "2026-12-02", P40).type).toBe("T");
    expect(adaptForHealth(sixBy800("q", ""), h, "2026-12-08", P40).type).toBe("I");
  });

  it("halves a Q of 50 min into 25 min of E at RPE ≤ 3 with a cold (EV-10)", () => {
    const q = hard("q", "2026-11-23T18:00", 50);
    const r = reportUnavailable(state([q]), { reason: "sick", feverOrChest: false }, MON_8);
    expect(r.state.health.kind).toBe("cold");
    expect(r.options?.jog).toMatchObject({ type: "E", durMin: 25, rpeTarget: 3 });
    expect(feelBetter(r.state, "2026-11-25T08:00").state.health).toEqual({ kind: "ok" });
  });

  it("never keeps a long run of 1 h 06 with a cold: 30 min of E (EV-10)", () => {
    const l = long("l", "2026-11-23T18:00", 66);
    const r = reportUnavailable(state([l]), { reason: "sick", feverOrChest: false }, MON_8);
    expect(r.options?.jog).toMatchObject({ type: "E", durMin: 30 });
    expect(adaptForHealth(easy("e", "", 25), { kind: "cold", since: "2026-11-23" }, "2026-11-23", P40).durMin).toBe(15);
  });

  it("offers 40 min of E or 45 min of bike for a knee at 2 (EV-11)", () => {
    const r = reportUnavailable(
      state([easy("e", "2026-11-23T18:00")]),
      { reason: "pain", where: "genou", walking0to10: 2 },
      MON_8,
    );
    expect(r.options?.jog).toMatchObject({ type: "E", durMin: 40, pilot: "rpe" });
    expect(r.options?.bikeMin).toBe(45);
    expect(r.warnings.map((w) => w.ruleId)).toEqual(["EV11"]);
  });

  it("sends the physio message once when pain ≥ 4 lasts more than 3 days (EV-12)", () => {
    const pain = { reason: "pain" as const, where: "cheville" as const, walking0to10: 5, until: "2026-11-28" };
    const day1 = reportUnavailable(state([easy("e", "2026-11-23T18:00")]), pain, MON_8);
    expect(day1.options?.jog?.durMin).toBe(20);
    expect(day1.warnings.map((w) => w.ruleId)).toEqual(["EV12"]);
    const day4 = reportUnavailable(day1.state, pain, "2026-11-26T08:00");
    expect(day4.warnings.map((w) => w.ruleId)).toEqual(["EV12", "EV12"]);
    expect(day4.warnings[1]?.message).toContain("kiné ou un médecin");
    const day5 = reportUnavailable(day4.state, pain, "2026-11-27T08:00");
    expect(day5.warnings).toHaveLength(1);
  });

  it("advises rest with a 20 min E possible and no message for one day at 4 (EV-13)", () => {
    const r = reportUnavailable(
      state([easy("e", "2026-11-23T18:00")]),
      { reason: "pain", where: "pied", walking0to10: 4 },
      MON_8,
    );
    expect(r.options?.jog?.durMin).toBe(20);
    expect(r.warnings).toHaveLength(1);
    expect(adaptForHealth(easy("x", ""), r.state.health, "2026-11-24", P40).durMin).toBe(45);
  });

  it("lifts pain with G7 and ignores feelBetter without a status (EV13)", () => {
    const st = state([easy("e", "2026-11-30T18:00", 60)], [], {
      health: { kind: "pain", since: "2026-11-20", level: 5, where: "mollet", orientationSent: true },
    });
    const r = feelBetter(st, "2026-11-29T08:00");
    expect(r.state.health).toEqual({ kind: "ok" });
    expect(r.state.sessions[0]?.durMin).toBe(42);
    expect(feelBetter(state([]), MON_8).warnings[0]?.ruleId).toBe("EV13");
    expect(adaptForHealth(easy("e", ""), { kind: "ok" }, "2026-11-23", P40).durMin).toBe(45);
  });
});

describe("onTimetableChange and updateSettings (EV14, EV15)", () => {
  it("moves a run hit by a new class and says so in the banner (EV-14)", () => {
    const st = state([easy("e", "2026-11-27T18:00")]);
    const course = block("c1", "2026-11-27T17:00", "2026-11-27T19:00", "class");
    const r = onTimetableChange(st, [course], "2026-11-25T10:00");
    expect(r.state.sessions[0]?.start).not.toBe("2026-11-27T18:00");
    expect(r.banner).toBe("1 cours ajouté vendredi · 1 course déplacée");
    expect(r.state.cal).toContainEqual(LEGS);
  });

  it("reports cancelled and moved classes", () => {
    const old = [
      block("c1", "2026-11-26T08:00", "2026-11-26T10:00", "class"),
      block("c2", "2026-11-27T08:00", "2026-11-27T10:00", "class"),
    ];
    const moved = { ...block("c2", "2026-11-27T10:00", "2026-11-27T12:00", "class") };
    const r = onTimetableChange(state([], [LEGS, ...old]), [moved], "2026-11-25T10:00");
    expect(r.banner).toBe("1 cours annulé jeudi · 1 cours modifié vendredi");
    expect(onTimetableChange(state([]), [], MON_8).banner).toBeUndefined();
  });

  it("keeps a manual run with a warning when bedtime moves earlier, and moves the others (EV-17)", () => {
    const manual = easy("m", "2026-11-26T20:45", 45, { manual: true });
    const other = easy("o", "2026-11-28T20:30");
    const r = updateSettings(state([manual, other]), { bedtime: "22:00" }, MON_8);
    expect(byId(r.state.sessions, "m")?.start).toBe("2026-11-26T20:45");
    expect(r.warnings).toContainEqual(expect.objectContaining({ ruleId: "H7", sessionId: "m" }));
    expect(byId(r.state.sessions, "o")?.start).not.toBe("2026-11-28T20:30");
    expect(r.state.settings.bedtime).toBe("22:00");
  });
});

describe("detectMissed (EV16, EV17)", () => {
  const tuesdayQ = sixBy800("q", "2026-11-24T18:00");

  it("marks a Q missed after a sync the next morning, adding nothing (EV-15)", () => {
    const r = detectMissed(state([tuesdayQ]), [], "2026-11-25T07:00", "2026-11-25T07:00");
    expect(r.state.sessions).toHaveLength(1);
    expect(r.state.sessions[0]?.status).toBe("missed");
  });

  it("asks instead when the last sync is older than the end of the day (EV-16)", () => {
    const r = detectMissed(state([tuesdayQ]), [], "2026-11-24T16:00", "2026-11-25T07:00");
    expect(r.state.sessions[0]?.status).toBe("planned");
    expect(r.warnings).toEqual([{ ruleId: "EV17", message: "Tu as couru ?", sessionId: "q" }]);
  });

  it("marks a run of the same day done", () => {
    const run = { id: "a", start: "2026-11-24T18:05", durMin: 50, distM: 9000 };
    const r = detectMissed(state([tuesdayQ]), [run], "2026-11-25T07:00", "2026-11-25T07:00");
    expect(r.state.sessions[0]?.status).toBe("done");
  });

  it("attaches a Wednesday run to Thursday's E as a move by Anna (EV-18)", () => {
    const run = { id: "a", start: "2026-11-25T18:00", durMin: 45, distM: 8000 };
    const r = detectMissed(state([easy("e", "2026-11-26T18:00")]), [run], "2026-11-25T19:00", "2026-11-25T19:00");
    expect(r.state.sessions[0]).toMatchObject({ status: "done", start: "2026-11-25T18:00", manual: true });
    expect(r.changes[0]?.ruleId).toBe("EV16_MOVED");
  });

  it("ignores a run shorter than half the plan", () => {
    const run = { id: "a", start: "2026-11-24T18:05", durMin: 10, distM: 2000 };
    expect(
      detectMissed(state([tuesdayQ]), [run], "2026-11-25T07:00", "2026-11-25T07:00").state.sessions[0]?.status,
    ).toBe("missed");
  });
});

describe("logFeel (C3, RC5)", () => {
  it("stores the feel and raises a pace check after three hard easy runs", () => {
    const runs = ["23", "25", "27"].map((d) => easy(`e${d}`, `2026-11-${d}T18:00`));
    let st = state(runs);
    for (const s of runs.slice(0, 2)) st = logFeel(st, s.id, "hard").state;
    expect(st.feels).toHaveLength(2);
    const r = logFeel(st, "e27", "hard");
    expect(r.warnings[0]?.ruleId).toBe("RC5");
    expect(logFeel(state(runs), "e23", "ok").warnings).toEqual([]);
  });
});

describe("done or skipped without a synced run (EV21)", () => {
  const q = hard("q", "2026-11-23T18:00");
  const other = easy("e", "2026-11-25T18:00");

  it("marks a session done once it has started, never before (EV-25)", () => {
    const r = confirmDone(state([q, other]), "q", "2026-11-23T20:00");
    expect(r.state.sessions.find((s) => s.id === "q")?.status).toBe("done");
    expect(r.changes.map((c) => c.ruleId)).toEqual(["EV21"]);
    expect(confirmDone(state([q]), "q", MON_8).ok).toBe(false);
  });

  it("skips a session and never makes it up: nothing else moves or appears (EV-26)", () => {
    const r = skipSession(state([q, other]), "q");
    expect(r.state.sessions).toEqual([{ ...q, status: "skipped" }, other]);
    expect(skipSession(r.state, "q").ok).toBe(false);
  });
});

describe("an event she adds (EV22)", () => {
  it("moves a run within 12 h that now breaks a rule, and says why (EV-27)", () => {
    // Long run tonight 17:00 to 18:30, then she adds legs at 19:00 the same evening: H6.
    const l = long("l", "2026-11-23T17:00");
    const legs = { ...block("legs2", "2026-11-23T19:00", "2026-11-23T20:00", "strength"), legs: true };
    const st = state([l], []);
    const before = onTimetableChange({ ...st, cal: [legs] }, [], MON_8);
    expect(before.proposals?.map((p) => p.sessionId)).toEqual(["l"]);
    const r = onTimetableChange({ ...st, cal: [legs] }, [], MON_8, true);
    expect(r.proposals).toEqual([]);
    expect(r.changes).toEqual([
      expect.objectContaining({
        ruleId: "EV22",
        sessionId: "l",
        detail: "Moins d'1 h entre ta course et ta séance jambes",
      }),
    ]);
    expect(r.state.sessions[0]?.start).not.toBe(l.start);
  });
});
