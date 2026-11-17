import { readFileSync } from "node:fs";
import { buildSession, isHard, paces } from "@annarrive/coach";
import {
  type CalendarEvent,
  changeResponseSchema,
  type GarminActivity,
  type PlannedSession,
  programViewSchema,
  proposalSchema,
  unavailablePreviewSchema,
} from "@annarrive/protocol";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { coachAdapter, toSession } from "../src/coach-adapter.ts";
import { workoutHash } from "../src/garmin/workout.ts";
import { addDays, addMinutes } from "../src/time.ts";
import { fakeBridge, setup } from "./helpers.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
/** Sunday 15 November 2026, 18:00 in Paris: the Sunday job's moment. */
const SUNDAY_6PM = new Date("2026-11-15T17:00:00Z");
const P40 = paces(40);

const legs = {
  kind: "strength",
  title: "Jambes",
  start: "2026-11-18T18:00",
  end: "2026-11-18T19:00",
  legs: true,
  recurrence: "none",
};

/** A coach-built session stored as the server stores it. */
function built(id: string, type: PlannedSession["type"], start: string, durMin = 45): PlannedSession {
  const s = buildSession(type, { weeklyMin: 200, paces: P40, phase: "dev", progressionStep: 0, distM: 10000, durMin });
  return { ...s, id, start, steps: s.steps.map((st) => ({ ...st })) };
}

/** Four runs of 45 min a week for eight weeks before `monday`. */
function history(t: ReturnType<typeof setup>, monday: string) {
  for (let w = 1; w <= 8; w++)
    for (const d of [0, 2, 4, 6])
      t.stores.activity.put({
        id: `h${w}-${d}`,
        start: `${addDays(monday, d - 7 * w)}T08:00`,
        durMin: 45,
        distM: 7200,
      });
}

async function ready(options: Parameters<typeof setup>[0] = {}) {
  const t = setup({ coach: coachAdapter, ...options });
  await t.login();
  return t;
}

const change = async (t: Awaited<ReturnType<typeof ready>>, method: string, path: string, body?: unknown) => {
  const r = await t.call(method, path, body);
  return { status: r.status, ...changeResponseSchema.parse(r.json) };
};

const level = (t: ReturnType<typeof setup>) => t.stores.fitnessEstimate.list().at(-1)?.vdot;

const ends = (e: { end: string }) => e.end;
const overlapsWithMargin = (s: PlannedSession, e: CalendarEvent) =>
  s.start < addMinutes(ends(e), 30) && addMinutes(s.start, s.durMin) > e.start;

describe("coach adapter: building weeks", () => {
  it("builds a full week around the timetable and the legs session, then rebuilds it identically", async () => {
    const t = await ready({ ics: fixture("timetable-v1.ics") });
    t.setNow(SUNDAY_6PM);
    await t.services.timetable.refresh();
    await t.call("POST", "/api/events", legs);
    await t.call("POST", "/api/events", {
      ...legs,
      title: "Haut du corps",
      start: "2026-11-20T12:00",
      end: "2026-11-20T13:00",
      legs: false,
    });
    history(t, "2026-11-16");
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });

    const saved = await change(t, "PUT", "/api/program", { goal: { distanceM: 10000, date: "2027-03-14" } });
    expect(saved.change).not.toBeNull();

    const week = t.services.plan.coachState().sessions.filter((s) => s.start >= "2026-11-16");
    const events = t.services.plan.coachState().events.filter((e) => e.start >= "2026-11-16");
    expect(week).toHaveLength(3);
    expect(new Set(week.map((s) => s.start.slice(0, 10))).size).toBe(3);
    for (const s of week) {
      expect(events.some((e) => overlapsWithMargin(s, e))).toBe(false);
      expect(s.start >= "2026-11-16T07:00" && addMinutes(s.start, s.durMin).slice(11) <= "21:30").toBe(true);
    }
    // H5: nothing hard within 24 h after the legs session ends on Wednesday 19:00.
    for (const s of week.filter((x) => isHard(toSession(x))))
      expect(s.start < "2026-11-18T18:00" || s.start >= "2026-11-19T19:00").toBe(true);

    expect((await t.services.plan.buildNextWeek()).change).toBeNull();
  });

  it("plans maintenance without a goal, and asks for a level before planning anything", async () => {
    const t = await ready();
    t.setNow(SUNDAY_6PM);
    const none = await t.services.plan.buildNextWeek();
    expect(none.change).toBeNull();
    expect(none.warnings[0]).toContain("chrono récent");

    history(t, "2026-11-16");
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });
    await t.services.plan.buildNextWeek();
    const week = t.services.plan.coachState().sessions.filter((s) => s.start >= "2026-11-16");
    expect(week).toHaveLength(3);
    expect(week.filter((s) => isHard(toSession(s)))).toHaveLength(1);
  });
});

describe("coach adapter: a new goal (EV14)", () => {
  /** Wednesday 18 November 2026, 9:00 in Paris: next Monday is within the watch's 7 days. */
  const WEDNESDAY = new Date("2026-11-18T08:00:00Z");
  const NEXT_MONDAY = "2026-11-23";

  it("regenerates next week from the new goal, keeps this week and what she moved, undoes as one, updates the watch", async () => {
    const bridge = fakeBridge();
    const t = await ready({ bridge });
    t.setNow(WEDNESDAY);
    history(t, "2026-11-16");
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });
    const declaredTime = { distanceM: 10000, minutes: 52 };
    await t.call("PUT", "/api/program", { goal: { distanceM: 10000, date: "2027-03-14" }, declaredTime });
    const sessions = () => t.services.plan.coachState().sessions;
    const thisWeek = () => sessions().filter((s) => s.start < NEXT_MONDAY);
    const nextWeek = () => sessions().filter((s) => s.start >= NEXT_MONDAY);
    const quality = nextWeek().find((s) => s.type === "COTES_C");
    expect(quality).toBeDefined();
    await change(t, "POST", `/api/sessions/${quality?.id}/move`, { start: "2026-11-27T12:00" });
    const moved = sessions().find((s) => s.id === quality?.id);
    const before = { current: thisWeek(), next: nextWeek(), program: t.services.plan.program() };

    const saved = await change(t, "PUT", "/api/program", { goal: { distanceM: 5000, date: "2026-12-06" } });

    expect(saved.change?.summary).toMatch(/^Objectif modifié/);
    expect(thisWeek()).toEqual(before.current);
    expect(nextWeek()).not.toEqual(before.next);
    expect(nextWeek()).toContainEqual(moved);
    // Her moved hill session stands in for the new week's fartlek: still three runs.
    expect(
      nextWeek()
        .map((s) => s.type)
        .sort(),
    ).toEqual(["COTES_C", "E", "L"]);
    expect(t.services.plan.program()).toEqual({
      goal: { distanceM: 5000, date: "2026-12-06" },
      declaredTime,
      startedOn: "2026-11-18",
    });
    const onWatchSoon = () => sessions().filter((s) => s.start >= "2026-11-18" && s.start < "2026-11-25");
    await vi.waitFor(() => {
      for (const s of onWatchSoon()) expect(t.stores.watchSync.get(s.id)?.hash).toBe(workoutHash(s));
    });

    await t.call("POST", `/api/changes/${saved.change?.id}/undo`);
    expect({ current: thisWeek(), next: nextWeek(), program: t.services.plan.program() }).toEqual(before);
  });
});

describe("coach adapter: Anna's actions", () => {
  it("accepts a move that breaks the 24 h legs rule, warns, and turns the hard run easy", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", legs);
    t.stores.plannedSession.put(built("tempo", "T", "2026-11-21T10:00"));

    const moved = await change(t, "POST", "/api/sessions/tempo/move", { start: "2026-11-19T07:30" });

    expect(moved.status).toBe(200);
    expect(moved.warnings).toEqual(["Moins de 24 h après ta séance jambes"]);
    expect(t.stores.plannedSession.get("tempo")).toMatchObject({ start: "2026-11-19T07:30", type: "E", manual: true });
  });

  it("refuses a move onto a class, writing nothing", async () => {
    const t = await ready({ ics: fixture("timetable-v1.ics") });
    await t.services.timetable.refresh();
    t.stores.plannedSession.put(built("easy", "E", "2026-11-18T18:00"));

    const r = await t.call("POST", "/api/sessions/easy/move", { start: "2026-11-17T14:00" });

    expect(r).toEqual({ status: 400, json: { error: "Créneau pris dans ton agenda" } });
    expect(t.stores.plannedSession.get("easy")?.start).toBe("2026-11-18T18:00");
  });

  it("proposes move slots with a French reason", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("easy", "E", "2026-11-18T18:00"));
    const slots = (await t.call("GET", "/api/sessions/easy/slots")).json;
    expect(slots).toMatchObject({ best: expect.arrayContaining([expect.objectContaining({ reason: "même jour" })]) });
  });

  it("offers Changer options never above the plan and applies one", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("tempo", "T", "2026-11-18T18:00"));
    const options = z
      .record(z.string(), z.object({ durMin: z.number() }))
      .parse((await t.call("GET", "/api/sessions/tempo/options")).json);
    expect(options.jog30?.durMin).toBe(30);
    const r = await change(t, "POST", "/api/sessions/tempo/change", { option: "easier" });
    expect(t.stores.plannedSession.get("tempo")).toMatchObject({ type: "E", manual: true });
    expect(r.change?.summary).toBe("Séance passée en allure facile");
  });

  it("when sick with fever, advises rest and turns today's run into a short jog; undo restores both", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("tonight", "I", "2026-11-16T18:00", 60));
    const before = t.stores.plannedSession.get("tonight");

    const sick = await change(t, "POST", "/api/unavailable", { reason: "sick", feverOrChest: true });

    expect(sick.warnings[0]).toContain("Repos conseillé");
    expect(t.services.plan.health()).toEqual({ kind: "sick", since: "2026-11-16" });
    // Aujourd'hui reads it, so Pas dispo offers « Ça va mieux ».
    expect((await t.call("GET", "/api/today")).json).toMatchObject({ health: { kind: "sick" } });
    expect(t.stores.plannedSession.get("tonight")).toMatchObject({ type: "E" });
    expect(t.stores.plannedSession.get("tonight")?.durMin).toBeLessThanOrEqual(30);

    await t.call("POST", `/api/changes/${sick.change?.id}/undo`);
    expect(t.services.plan.health()).toEqual({ kind: "ok" });
    expect(t.stores.plannedSession.get("tonight")).toEqual(before);
  });

  it("previews Pas dispo with the real coach without writing anything", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("tonight", "T", "2026-11-16T18:00", 60));
    const before = t.stores.plannedSession.get("tonight");
    const changes = t.stores.changeLog.list().length;

    const { status, json } = await t.call("POST", "/api/unavailable/preview", {
      reason: "pain",
      where: "genou",
      walking0to10: 5,
    });
    const preview = unavailablePreviewSchema.parse(json);

    expect(status).toBe(200);
    expect(preview.warnings[0]).toContain("Repos ou vélo");
    expect(preview.days).toEqual([
      { date: "2026-11-16", before, after: expect.objectContaining({ type: "E", durMin: 20 }) },
    ]);
    expect(t.stores.plannedSession.get("tonight")).toEqual(before);
    expect(t.services.plan.health()).toEqual({ kind: "ok" });
    expect(t.stores.changeLog.list()).toHaveLength(changes);
    expect((await t.call("POST", "/api/unavailable/preview", { reason: "pain" })).status).toBe(400);
  });

  it("raises RC5 after three easy runs felt hard (C3)", async () => {
    const t = await ready();
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });
    for (const day of ["2026-11-10", "2026-11-12", "2026-11-14"]) {
      t.stores.plannedSession.put({ ...built(`e-${day}`, "E", `${day}T18:00`), status: "done" });
      t.stores.activity.put({
        id: `run-${day}`,
        start: `${day}T18:05`,
        durMin: 45,
        distM: 7000,
        sessionId: `e-${day}`,
      });
    }
    t.services.fitness.logFeel("run-2026-11-10", "hard");
    t.services.fitness.logFeel("run-2026-11-12", "hard");
    expect(t.services.fitness.pending()).toEqual([]);
    t.services.fitness.logFeel("run-2026-11-14", "hard");
    expect(t.services.fitness.pending()).toMatchObject([{ kind: "vdot", ruleId: "RC5" }]);
  });

  it("after a fever, feeling better starts the easy return (EV9)", async () => {
    const t = await ready();
    t.stores.health.put({ id: "current", value: { kind: "sick", since: "2026-11-14" } });
    await change(t, "POST", "/api/feel-better");
    expect(t.services.plan.health()).toEqual({
      kind: "recovering",
      easyUntil: "2026-11-19",
      qEasierUntil: "2026-11-26",
    });
    expect((await t.call("POST", "/api/feel-better")).status).toBe(400);
  });

  it("with strong pain, advises rest or bike and caps today's run to 20 easy minutes", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("tonight", "T", "2026-11-16T18:00", 60));

    const pain = await change(t, "POST", "/api/unavailable", { reason: "pain", where: "genou", walking0to10: 5 });

    expect(pain.warnings[0]).toContain("Repos ou vélo");
    expect(t.services.plan.health()).toMatchObject({ kind: "pain", level: 5, where: "genou" });
    expect(t.stores.plannedSession.get("tonight")).toMatchObject({ type: "E", durMin: 20, pilot: "rpe" });
  });

  it("follows a new timetable and moves the run a class now covers", async () => {
    const t = await ready({ ics: fixture("timetable-v1.ics") });
    t.stores.plannedSession.put(built("easy", "E", "2026-11-17T14:00"));
    await t.services.timetable.refresh();
    const run = t.stores.plannedSession.get("easy");
    expect(run?.start).not.toBe("2026-11-17T14:00");
    expect(run?.start.slice(0, 10)).toBe("2026-11-17");
  });

  it("replans the weeks when the settings change", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("early", "E", "2026-11-18T07:00"));
    await change(t, "PATCH", "/api/profile", { earliest: "09:00" });
    expect(t.stores.plannedSession.get("early")?.start.slice(11)).not.toBe("07:00");
  });
});

describe("coach adapter: morning decision", () => {
  function signals(t: ReturnType<typeof setup>, today: { rhr: number; sleepMin?: number }) {
    for (let d = 1; d <= 20; d++) t.stores.dailySignal.put({ id: addDays("2026-11-16", -d), rhr: 50, sleepMin: 480 });
    t.stores.dailySignal.put({ id: "2026-11-16", ...today });
  }

  it("lightens a hard run when two signals agree, then freezes it", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("tonight", "T", "2026-11-16T18:00", 60));
    signals(t, { rhr: 60, sleepMin: 300 });

    const decided = t.services.plan.morningDecision();

    expect(decided?.change?.summary).toBe("Séance du jour allégée");
    expect(t.stores.plannedSession.get("tonight")).toMatchObject({ type: "E", frozen: true });
    expect(t.services.plan.morningDecision()).toBeNull();
  });

  it("decides 2 h before an early run even before the night is in (D1), not earlier", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("dawn", "E", "2026-11-16T07:00"));
    t.setNow(new Date("2026-11-16T03:55:00Z")); // 04:55
    expect(t.services.plan.morningDecision()).toBeNull();
    t.setNow(new Date("2026-11-16T04:00:00Z")); // 05:00
    expect(t.services.plan.morningDecision()?.change?.summary).toBe("Séance du jour confirmée");
    expect(t.stores.plannedSession.get("dawn")?.frozen).toBe(true);
  });

  it("keeps an evening run open until 10:00 without the night's sleep", async () => {
    const t = await ready();
    t.stores.plannedSession.put(built("evening", "E", "2026-11-16T18:00"));
    expect(t.services.plan.morningDecision()).toBeNull();
    t.setNow(new Date("2026-11-16T09:00:00Z"));
    expect(t.services.plan.morningDecision()).not.toBeNull();
  });

  it("adapts today's run to a cold, and advises rest when four signals fire", async () => {
    const t = await ready();
    t.stores.health.put({ id: "current", value: { kind: "cold", since: "2026-11-15" } });
    t.stores.plannedSession.put(built("tonight", "I", "2026-11-16T18:00", 60));
    t.stores.calendarEvent.put({
      id: "exam",
      kind: "exam",
      title: "Partiel",
      start: "2026-11-17T09:00",
      end: "2026-11-17T11:00",
      manual: false,
      cancelled: false,
      recurrence: "none",
      exceptions: [],
    });
    for (let d = 1; d <= 20; d++)
      t.stores.dailySignal.put({
        id: addDays("2026-11-16", -d),
        rhr: 50 + (d % 2),
        sleepMin: 480 + (d % 3) * 10,
        bodyBatteryWake: 80 + (d % 2) * 4,
        stressAvg: 25 + (d % 2),
      });
    t.stores.dailySignal.put({ id: "2026-11-16", rhr: 62, sleepMin: 240, bodyBatteryWake: 30, stressAvg: 60 });

    const decided = t.services.plan.morningDecision();

    expect(decided?.change?.summary).toBe("Repos proposé aujourd'hui");
    expect(decided?.warnings).toContain("Tes signaux de récupération sont bas : repos conseillé aujourd'hui.");
    expect(t.stores.plannedSession.get("tonight")).toMatchObject({ type: "E", frozen: true });
  });
});

describe("coach adapter: fitness and recalibration", () => {
  function garminRun(id: number, start: string, over: Partial<GarminActivity> = {}): GarminActivity {
    return {
      id,
      type: "running",
      startTimeLocal: start,
      startTimeGmt: null,
      durationS: 22 * 60,
      distanceM: 5000,
      avgSpeedMps: null,
      avgPaceSPerKm: null,
      avgHr: 182,
      maxHr: 192,
      elevationGainM: 0,
      feel: null,
      rpe: null,
      ...over,
    };
  }

  it("estimates a provisional level from the declared time when the programme starts", async () => {
    const t = await ready();
    await t.call("PUT", "/api/program", {
      goal: { distanceM: 10000, date: "2027-03-14" },
      declaredTime: { distanceM: 10000, minutes: 52 },
    });
    expect(t.stores.fitnessEstimate.list().at(-1)).toMatchObject({ source: "declared", provisional: true });
    expect(t.services.plan.coachState().sessions.length).toBeGreaterThan(0);
  });

  it("estimates the first level from a hard Garmin run, then proposes the measured one over a provisional level", async () => {
    const bridge = fakeBridge();
    const t = await ready({ bridge });
    const garmin = t.services.garmin;
    if (!garmin) throw new Error("garmin service missing");

    bridge.recentActivities.mockResolvedValue([garminRun(1, "2026-11-14 09:00:00")]);
    await garmin.syncActivities();
    expect(t.stores.fitnessEstimate.list().at(-1)).toMatchObject({ provisional: false });

    t.stores.fitnessEstimate.put({
      id: "2026-11-16",
      date: "2026-11-16",
      vdot: 38,
      source: "declared",
      provisional: true,
    });
    bridge.recentActivities.mockResolvedValue([garminRun(2, "2026-11-16 07:00:00", { durationS: 21 * 60 })]);
    await garmin.syncActivities();

    const pending = z.array(proposalSchema).parse((await t.call("GET", "/api/proposals")).json);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ ruleId: "F10", from: 38, status: "pending" });
  });

  it("applies an accepted proposal to future paces, and undo brings the old level back", async () => {
    const t = await ready();
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });
    t.stores.plannedSession.put(built("tempo", "T", "2026-11-19T18:00"));
    const before = t.stores.plannedSession.get("tempo");
    t.stores.proposal.put({
      id: "p1",
      kind: "vdot",
      from: 40,
      to: 42,
      ruleId: "RC1",
      evidence: ["garmin:9"],
      expiresOn: "2026-11-30",
      status: "pending",
    });

    const accepted = await change(t, "POST", "/api/proposals/p1/accept");

    expect(accepted.change?.summary).toBe("Allures mises à jour");
    expect(level(t)).toBe(42);
    expect(t.stores.plannedSession.get("tempo")?.steps.find((s) => s.zone === "T")?.target.paceSKm).toEqual([
      paces(42).T,
      paces(42).T,
    ]);
    expect((await t.call("GET", "/api/proposals")).json).toEqual([]);
    expect((await t.call("POST", "/api/proposals/p1/accept")).status).toBe(403);

    await t.call("POST", `/api/changes/${accepted.change?.id}/undo`);
    expect(level(t)).toBe(40);
    expect(t.stores.plannedSession.get("tempo")).toEqual(before);
    expect(t.stores.proposal.get("p1")?.status).toBe("pending");
  });

  it("declines a proposal in one tap, undoably", async () => {
    const t = await ready();
    t.stores.proposal.put({
      id: "p2",
      kind: "test",
      from: 42,
      to: 44.5,
      ruleId: "RC7",
      evidence: [],
      expiresOn: "2026-11-30",
      status: "pending",
    });
    const declined = await change(t, "POST", "/api/proposals/p2/decline");
    expect(t.stores.proposal.get("p2")).toMatchObject({ status: "declined", decidedOn: "2026-11-16" });
    await t.call("POST", `/api/changes/${declined.change?.id}/undo`);
    expect(t.stores.proposal.get("p2")?.status).toBe("pending");
    expect((await t.call("POST", "/api/proposals/missing/decline")).status).toBe(404);
  });
});

describe("watch latency", () => {
  it("sends a moved session to the watch right away, and marks it failed when Garmin refuses", async () => {
    const bridge = fakeBridge();
    const t = await ready({ bridge });
    t.stores.plannedSession.put(built("easy", "E", "2026-11-18T18:00"));

    await t.call("POST", "/api/sessions/easy/move", { start: "2026-11-19T07:30" });
    await vi.waitFor(() => expect(t.stores.watchSync.get("easy")?.status).toBe("sent"));

    bridge.createWorkout.mockRejectedValue(new Error("refusé"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await t.call("POST", "/api/sessions/easy/move", { start: "2026-11-20T07:30" });
    await vi.waitFor(() => expect(t.stores.watchSync.get("easy")?.status).toBe("failed"));
  });

  it("leaves the watch alone for a change beyond the next 7 days", async () => {
    const bridge = fakeBridge();
    const t = await ready({ bridge });
    t.stores.plannedSession.put(built("far", "E", "2026-11-28T18:00"));
    await t.call("POST", "/api/sessions/far/move", { start: "2026-11-29T09:00" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(bridge.createWorkout).not.toHaveBeenCalled();
  });
});

describe("coach adapter: the programme's plan", () => {
  const program = async (t: Awaited<ReturnType<typeof ready>>) =>
    programViewSchema.parse((await t.call("GET", "/api/program")).json);

  it("returns the phases from the Monday after the start, and rates her target like onboarding", async () => {
    const t = await ready();
    t.setNow(SUNDAY_6PM);
    expect(await program(t)).toEqual({ goal: null });

    history(t, "2026-11-16");
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });
    const goal = { distanceM: 10000, date: "2027-03-14", targetMin: 52 };
    await t.call("PUT", "/api/program", { goal });
    const { plan } = await program(t);
    expect(plan?.firstMonday).toBe("2026-11-16");
    expect(plan?.phases.map((p) => p.phase)).toEqual(["base", "dev", "spe", "taper"]);
    expect(plan?.phases.reduce((sum, p) => sum + p.weeks, 0)).toBe(17);
    expect(plan?.verdict).toBe("atteignable");

    await t.call("PUT", "/api/program", { goal: { ...goal, targetMin: 30 } });
    expect((await program(t)).plan?.verdict).toBe("ambitieux");
    await t.call("PUT", "/api/program", { goal: { distanceM: 10000, date: "2027-03-14" } });
    expect((await program(t)).plan?.verdict).toBeUndefined();
  });

  it("keeps the phases for a new target time alone, and restarts them for a new date (EV-22)", async () => {
    const t = await ready();
    t.setNow(SUNDAY_6PM);
    history(t, "2026-11-16");
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });
    const goal = { distanceM: 10000, date: "2027-03-14", targetMin: 52 };
    await t.call("PUT", "/api/program", { goal });
    const before = (await program(t)).plan;

    t.setNow(new Date("2026-11-25T08:00:00Z"));
    await t.call("PUT", "/api/program", { goal: { ...goal, targetMin: 48 } });
    const target = (await program(t)).plan;
    expect({ firstMonday: target?.firstMonday, phases: target?.phases }).toEqual({
      firstMonday: before?.firstMonday,
      phases: before?.phases,
    });

    await t.call("PUT", "/api/program", { goal: { ...goal, date: "2027-04-11" } });
    expect((await program(t)).plan?.firstMonday).toBe("2026-11-30");
  });

  it("has no plan until her level is known", async () => {
    const t = await ready();
    await t.call("PUT", "/api/program", { goal: { distanceM: 10000, date: "2027-03-14" } });
    expect((await program(t)).plan).toBeUndefined();
  });
});
