import { type ChatWidget, chatWidgetSchema } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type ReggieTool, reggieTools } from "../src/reggie/tools.ts";
import { fakeCoach, session, setup } from "./helpers.ts";

function prepare(options: Parameters<typeof setup>[0] = {}) {
  const t = setup(options);
  t.stores.plannedSession.put(session("tonight", "2026-11-16T18:00", { type: "I", durMin: 60 }));
  const widgets: ChatWidget[] = [];
  const tools = reggieTools(t.services.plan, widgets);
  const byName = (name: string): ReggieTool => {
    const found = tools.find((x) => x.name === name);
    if (!found) throw new Error(`no tool ${name}`);
    return found;
  };
  /** Validates the input like the SDK does, then runs the handler. */
  async function call(name: string, input: Record<string, unknown> = {}) {
    const def = byName(name);
    const args = z.object(def.inputSchema).parse(input);
    // Each tool has its own argument type; the schema parse above checks it.
    const handler = def.handler as (input: unknown, extra: unknown) => ReturnType<ReggieTool["handler"]>;
    const result = await handler(args, {});
    const first = result.content[0];
    return { isError: result.isError ?? false, json: JSON.parse(first?.type === "text" ? first.text : "null") };
  }
  return { ...t, widgets, tools, byName, call };
}

describe("Reggie's tools", () => {
  it("exposes only the app's actions", () => {
    expect(prepare().tools.map((x) => x.name)).toEqual([
      "get_today",
      "get_week",
      "get_program",
      "get_recent",
      "propose_move_slots",
      "move_session",
      "change_options",
      "change_session",
      "report_unavailable",
      "feel_better",
      "update_setting",
      "request_session",
      "add_event",
      "edit_event",
      "cancel_class",
      "change_goal",
      "ask_choice",
      "ask_level",
    ]);
  });

  it("never hands Anna's timetable link to the model", async () => {
    const t = prepare();
    const link = "https://edt.univ.fr/secret-token.ics";
    t.stores.profile.put({ id: "current", value: { ...t.services.plan.profile(), icsUrl: link } });
    for (const x of t.tools) {
      if (x.name.startsWith("ask_")) continue;
      const input = x.name === "update_setting" ? { patch: { runsPerWeek: 3 } } : {};
      const parsed = z.object(x.inputSchema).safeParse(input);
      if (!parsed.success) continue;
      expect(JSON.stringify(await t.call(x.name, input))).not.toContain("secret-token");
    }
    expect((await t.call("get_program")).json.settings.runsPerWeek).toBeDefined();
  });

  it("writes paces as the app does, so Reggie copies them", async () => {
    const t = prepare();
    const steps = [
      { kind: "work" as const, durMin: 45, zone: "E" as const, target: { paceSKm: [360, 360] as [number, number] } },
    ];
    t.stores.plannedSession.put(session("tonight", "2026-11-16T18:00", { steps }));
    expect((await t.call("get_today")).json.session.steps[0].target).toEqual({ paceSKm: "6'00\u00a0/km" });
  });

  it("gives every dated thing its day in words, so Reggie never counts days", async () => {
    const t = prepare();
    t.stores.plannedSession.put(session("tue", "2026-11-17T18:00"));
    const week = (await t.call("get_week")).json;
    expect(week.days[0]).toMatchObject({ date: "2026-11-16", day: "aujourd'hui, lundi 16" });
    expect(week.days[1].sessions[0]).toMatchObject({ id: "tue", day: "demain, mardi 17" });
    expect(week.days[3].day).toBe("jeudi 19");
  });

  it("reads today, the week, the program and recent data through the plan service", async () => {
    const t = prepare();
    t.stores.activity.put({ id: "a1", start: "2026-11-14T10:00", durMin: 40, distM: 7000, hrSeries: [120, 130] });
    t.stores.dailySignal.put({ id: "2026-11-15", rhr: 50 });

    expect((await t.call("get_today")).json.session.id).toBe("tonight");
    expect((await t.call("get_week")).json.week).toBe("2026-W47");
    expect((await t.call("get_week", { week: "2026-W48" })).json.days[0].date).toBe("2026-11-23");
    expect((await t.call("get_program")).json).toMatchObject({ program: { goal: null }, health: { kind: "ok" } });
    const recent = (await t.call("get_recent")).json;
    expect(recent.activities).toEqual([
      { id: "a1", start: "2026-11-14T10:00", durMin: 40, distM: 7000, day: "samedi 14" },
    ]);
    expect(recent.signals).toEqual([{ id: "2026-11-15", rhr: 50 }]);
    expect(t.widgets).toEqual([]);
  });

  it("proposes slots as a widget, then moves with an undoable change card", async () => {
    const t = prepare();
    const slots = await t.call("propose_move_slots", { sessionId: "tonight" });
    expect(slots.json.best).toHaveLength(1);

    const moved = await t.call("move_session", { sessionId: "tonight", start: "2026-11-18T18:00" });
    expect(moved.json.change.summary).toBe("Fractionné passé à mercredi 18:00");
    expect(t.stores.plannedSession.get("tonight")?.start).toBe("2026-11-18T18:00");
    expect(t.widgets.map((w) => w.type)).toEqual(["slots", "change"]);

    const card = t.widgets[1];
    if (card?.type !== "change") throw new Error("change card expected");
    t.services.changes.undo(card.changeId);
    expect(t.stores.plannedSession.get("tonight")?.start).toBe("2026-11-16T18:00");
  });

  it("shows change options as previews and applies the chosen one", async () => {
    const t = prepare();
    const options = await t.call("change_options", { sessionId: "tonight" });
    expect(options.json.shorter.durMin).toBe(45);
    expect(t.widgets.map((w) => (w.type === "session_preview" ? w.option : w.type))).toEqual([
      "shorter",
      "easier",
      "jog30",
    ]);

    await t.call("change_session", { sessionId: "tonight", option: "jog30" });
    expect(t.stores.plannedSession.get("tonight")).toMatchObject({ type: "E", durMin: 30, manual: true });
  });

  it("records sickness and pain as undoable health changes, and lifts them on feel_better", async () => {
    const t = prepare();
    const sick = await t.call("report_unavailable", { reason: "sick", feverOrChest: true });
    expect(sick.json.change.summary).toBe("Malade : footing tranquille jusqu'à ce que ça aille mieux");
    expect(t.services.plan.health()).toEqual({ kind: "sick", since: "2026-11-16" });

    await t.call("feel_better");
    expect(t.services.plan.health()).toEqual({ kind: "ok" });

    const pain = await t.call("report_unavailable", { reason: "pain", where: "mollet", level: 3 });
    expect(t.services.plan.health()).toMatchObject({ kind: "pain", where: "mollet", level: 3 });
    t.services.changes.undo(pain.json.change.id);
    expect(t.services.plan.health()).toEqual({ kind: "ok" });
  });

  it("refuses a health report with a missing answer instead of guessing it", async () => {
    const t = prepare();
    const result = await t.call("report_unavailable", { reason: "sick" });
    expect(result.isError).toBe(true);
    expect(t.services.plan.health()).toEqual({ kind: "ok" });
  });

  it("relays the coach's refusal and writes nothing", async () => {
    const t = prepare({
      coach: {
        ...fakeCoach,
        moveSession: (st) => ({ state: st, changes: [], warnings: [], refusal: "Samedi est un jour sans course." }),
      },
    });
    const result = await t.call("move_session", { sessionId: "tonight", start: "2026-11-21T10:00" });
    expect(result).toEqual({ isError: true, json: { ok: false, refused: "Samedi est un jour sans course." } });
    expect(t.stores.plannedSession.get("tonight")?.start).toBe("2026-11-16T18:00");
    expect(t.stores.changeLog.list()).toEqual([]);
  });

  it("refuses unknown sessions and finished ones", async () => {
    const t = prepare();
    t.stores.plannedSession.put(session("done", "2026-11-16T07:00", { status: "done" }));
    expect((await t.call("change_options", { sessionId: "nope" })).isError).toBe(true);
    expect((await t.call("change_session", { sessionId: "done", option: "easier" })).json.refused).toContain(
      "plus à venir",
    );
  });

  it("updates a setting, clears her preferred hour, and refuses a field it does not know", async () => {
    const t = prepare();
    await t.call("update_setting", { patch: { noRunDays: [6] } });
    expect(t.services.plan.profile().noRunDays).toEqual([6]);
    await t.call("update_setting", { patch: { preferredHour: "18:00", travelMin: 45 } });
    expect(t.services.plan.profile()).toMatchObject({ preferredHour: "18:00", travelMin: 45 });
    await t.call("update_setting", { patch: { preferredHour: null } });
    expect(t.services.plan.profile()).not.toHaveProperty("preferredHour");
    await expect(t.call("update_setting", { patch: { cycleTracking: true } })).rejects.toThrow();
  });

  it("asks questions with buttons or a slider, and every widget matches the protocol", async () => {
    const t = prepare();
    await t.call("ask_choice", { options: ["Oui", "Non"] });
    await t.call("ask_level", { label: "Combien sur 10 en marchant ?" });
    await t.call("propose_move_slots", { sessionId: "tonight" });
    await t.call("change_options", { sessionId: "tonight" });
    await t.call("feel_better");
    expect(t.widgets.slice(0, 2)).toEqual([
      { type: "choices", options: ["Oui", "Non"] },
      { type: "slider", label: "Combien sur 10 en marchant ?", min: 0, max: 10 },
    ]);
    for (const widget of t.widgets) expect(chatWidgetSchema.parse(widget)).toEqual(widget);
    await expect(t.call("ask_choice", { options: ["Seul"] })).rejects.toThrow();
  });

  /** A level and four weeks of 4 × 50 min, so the coach has her level and her usual week (M14 RQ5, RQ9). */
  function withHistory(t: ReturnType<typeof prepare>) {
    t.stores.fitnessEstimate.put({ id: "2026-11-01", date: "2026-11-01", vdot: 40, source: "test" });
    for (let i = 0; i < 16; i++) {
      const day = new Date(Date.UTC(2026, 10, 15 - 7 * Math.floor(i / 4) - (i % 4) * 2)).toISOString().slice(0, 10);
      t.stores.activity.put({ id: `a${i}`, start: `${day}T08:00`, durMin: 50, distM: 8500 });
    }
  }

  it("shows a requested session, records it only on apply, and Annuler takes it back (M14)", async () => {
    const t = prepare();
    withHistory(t);
    const ask = { type: "E", days: ["2026-11-18"], durMin: 40 };
    const shown = await t.call("request_session", { ...ask, apply: false });
    expect(shown.json).toMatchObject({ accepted: true, session: { type: "E", durMin: 40, manual: true } });
    expect(t.widgets.map((w) => w.type)).toEqual(["session_request"]);
    expect(t.stores.plannedSession.list()).toHaveLength(1);

    const applied = await t.call("request_session", { ...ask, apply: true });
    expect(applied.json.change.summary).toBe("Footing prévu mercredi 8:00");
    const added = t.stores.plannedSession.list().find((s) => s.id !== "tonight");
    expect(added).toMatchObject({ type: "E", start: "2026-11-18T08:00", durMin: 40, manual: true });
    const card = t.widgets[1];
    if (card?.type !== "change") throw new Error("change card expected");
    t.services.changes.undo(card.changeId);
    expect(t.stores.plannedSession.list().map((s) => s.id)).toEqual(["tonight"]);
    for (const widget of t.widgets) expect(chatWidgetSchema.parse(widget)).toEqual(widget);
  });

  it("relays a refusal with its reason and shows the coach's alternative (M14 RQ10)", async () => {
    const t = prepare();
    withHistory(t);
    const next = await t.call("request_session", { type: "I", days: ["2026-11-17"], apply: true });
    expect(next.json).toMatchObject({ accepted: false, refused: "Deux séances dures d'affilée" });
    expect(next.json.alternative.ask.type).toBe("I");
    expect(next.json.alternative.session.start.slice(0, 10)).not.toBe("2026-11-17");
    expect(t.widgets.map((w) => w.type)).toEqual(["session_request"]);
    expect(t.stores.plannedSession.list()).toHaveLength(1);

    t.stores.health.put({ id: "current", value: { kind: "sick", since: "2026-11-16" } });
    const sick = await t.call("request_session", { type: "E", apply: true });
    expect(sick.json).toEqual({
      accepted: false,
      refused: "Repos tant que la fièvre dure : je n'ajoute aucune course",
    });
    const unknown = await t.call("request_session", { type: "E", apply: false });
    expect(unknown.isError).toBe(false);
  });

  it("adds and edits her events, cancels and restores a class, and changes the goal, each undoable", async () => {
    const t = prepare();
    const busy = {
      kind: "strength",
      title: "Muscu",
      start: "2026-11-19T12:00",
      end: "2026-11-19T13:00",
      legs: true,
      recurrence: "none",
    };
    const added = await t.call("add_event", busy);
    expect(added.json.change.summary).toBe("Muscu ajoutée");
    const event = t.stores.calendarEvent.list()[0];
    expect(event).toMatchObject({ kind: "strength", legs: true, manual: true });
    await t.call("edit_event", { id: event?.id ?? "", patch: { legs: false } });
    expect(t.stores.calendarEvent.get(event?.id ?? "")?.legs).toBe(false);

    t.stores.calendarEvent.put({
      id: "ics:1",
      kind: "class",
      title: "UE2 PHYS",
      start: "2026-11-18T17:00",
      end: "2026-11-18T19:00",
      manual: false,
      cancelled: false,
      recurrence: "none",
      exceptions: [],
    });
    await t.call("cancel_class", { id: "ics:1" });
    expect(t.stores.calendarEvent.get("ics:1")?.cancelled).toBe(true);
    await t.call("cancel_class", { id: "ics:1", restore: true });
    expect(t.stores.calendarEvent.get("ics:1")?.cancelled).toBe(false);
    const wrong = await t.call("cancel_class", { id: event?.id ?? "" });
    expect(wrong.json.refused).toBe("Seuls les cours de l'emploi du temps peuvent être marqués annulés.");

    const goal = { distanceM: 10000, date: "2027-03-14", targetMin: 50 };
    const changed = await t.call("change_goal", { goal });
    expect(changed.json.change.summary).toBe("Objectif modifié");
    expect(t.services.plan.program().goal).toMatchObject(goal);
    expect(t.widgets.filter((w) => w.type === "change")).toHaveLength(5);
  });

  it("lets unexpected errors through", async () => {
    const t = prepare({
      coach: {
        ...fakeCoach,
        feelBetter: () => {
          throw new TypeError("bug");
        },
      },
    });
    await expect(t.call("feel_better")).rejects.toThrow("bug");
  });
});
