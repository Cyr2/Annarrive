import { changeResponseSchema, profileSchema, todaySchema, weekSchema } from "@talaria/protocol";
import { describe, expect, it } from "vitest";
import { session, setup } from "./helpers.ts";

const strength = {
  kind: "strength",
  title: "Jambes",
  start: "2026-11-17T18:00",
  end: "2026-11-17T19:00",
  recurrence: "weekly",
};

async function ready() {
  const t = setup();
  await t.login();
  return t;
}

async function change(t: Awaited<ReturnType<typeof ready>>, method: string, path: string, body?: unknown) {
  const response = await t.call(method, path, body);
  return { status: response.status, ...changeResponseSchema.parse(response.json) };
}

async function undo(t: Awaited<ReturnType<typeof ready>>, id: string | undefined) {
  return t.call("POST", `/api/changes/${id}/undo`);
}

describe("today and week", () => {
  it("shows today's session and the day's events in order", async () => {
    const t = await ready();
    t.stores.plannedSession.put(session("today", "2026-11-16T18:00"));
    t.stores.plannedSession.put(session("tomorrow", "2026-11-17T18:00"));
    await t.call("POST", "/api/events", { ...strength, start: "2026-11-16T12:00", end: "2026-11-16T13:00" });

    const today = todaySchema.parse((await t.call("GET", "/api/today")).json);

    expect(today.date).toBe("2026-11-16");
    expect(today.session?.id).toBe("today");
    expect(today.events.map((e) => e.title)).toEqual(["Jambes"]);
  });

  it("returns no session on a rest day", async () => {
    const t = await ready();
    expect(todaySchema.parse((await t.call("GET", "/api/today")).json)).toEqual({
      date: "2026-11-16",
      session: null,
      events: [],
    });
  });

  it("lays out an ISO week day by day, recurring strength on each week, past weeks read-only", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", strength);
    t.stores.plannedSession.put(session("thu", "2026-11-26T07:30"));

    const next = weekSchema.parse((await t.call("GET", "/api/weeks/2026-W48")).json);
    expect(next.readOnly).toBe(false);
    expect(next.days.map((d) => d.date)).toEqual([
      "2026-11-23",
      "2026-11-24",
      "2026-11-25",
      "2026-11-26",
      "2026-11-27",
      "2026-11-28",
      "2026-11-29",
    ]);
    expect(next.days[1]?.events[0]).toMatchObject({ title: "Jambes", start: "2026-11-24T18:00", legs: true });
    expect(next.days[3]?.sessions[0]?.id).toBe("thu");

    expect(weekSchema.parse((await t.call("GET", "/api/weeks/2026-W46")).json).readOnly).toBe(true);
  });

  it("rejects a malformed week in French", async () => {
    const t = await ready();
    const response = await t.call("GET", "/api/weeks/2026-47");
    expect(response.status).toBe(400);
    expect(response.json).toEqual({ error: expect.stringContaining("AAAA-Wss") });
  });
});

describe("calendar events", () => {
  it("adds a strength session, legs by default, and Annuler removes it", async () => {
    const t = await ready();
    const created = await change(t, "POST", "/api/events", strength);
    expect(created.status).toBe(201);
    expect(created.change?.summary).toBe("Muscu ajoutée");
    expect(t.stores.calendarEvent.list()).toHaveLength(1);

    expect((await undo(t, created.change?.id)).status).toBe(200);
    expect(t.stores.calendarEvent.list()).toHaveLength(0);
  });

  it("moves the run a new unavailability lands on, in the same change", async () => {
    const t = await ready();
    t.stores.plannedSession.put(session("run", "2026-11-18T18:00"));
    const created = await change(t, "POST", "/api/events", {
      kind: "unavailable",
      title: "Soirée chez Léa",
      start: "2026-11-18T17:00",
      end: "2026-11-18T22:00",
      recurrence: "none",
    });
    expect(created.change?.summary).toBe("Indispo ajoutée · 1 course déplacée");
    expect(t.stores.plannedSession.get("run")?.start).toBe("2026-11-18T22:30");

    await undo(t, created.change?.id);
    expect(t.stores.plannedSession.get("run")?.start).toBe("2026-11-18T18:00");
  });

  it("updates an event and Annuler restores the exact previous version", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", strength);
    const [event] = t.stores.calendarEvent.list();
    const updated = await change(t, "PATCH", `/api/events/${event?.id}`, { legs: false, title: "Haut du corps" });
    expect(updated.change?.summary).toBe("Muscu modifiée");
    expect(t.stores.calendarEvent.get(event?.id ?? "")).toMatchObject({ legs: false, title: "Haut du corps" });

    await undo(t, updated.change?.id);
    expect(t.stores.calendarEvent.get(event?.id ?? "")).toEqual(event);
  });

  it("refuses an end before the start", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", strength);
    const [event] = t.stores.calendarEvent.list();
    expect((await t.call("POST", "/api/events", { ...strength, end: "2026-11-17T17:00" })).status).toBe(400);
    expect((await t.call("PATCH", `/api/events/${event?.id}`, { end: "2026-11-17T17:00" })).status).toBe(400);
  });

  it("deletes this week only, this week and the following, or the whole series", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", strength);
    const [event] = t.stores.calendarEvent.list();
    const id = event?.id ?? "";
    const weekDays = async (week: string) =>
      weekSchema.parse((await t.call("GET", `/api/weeks/${week}`)).json).days.flatMap((d) => d.events);

    await t.call("DELETE", `/api/events/${id}?scope=occurrence&date=2026-11-24`);
    expect(await weekDays("2026-W48")).toHaveLength(0);
    expect(await weekDays("2026-W49")).toHaveLength(1);

    await t.call("DELETE", `/api/events/${id}?scope=following&date=2026-12-01`);
    expect(await weekDays("2026-W49")).toHaveLength(0);
    expect(await weekDays("2026-W47")).toHaveLength(1);

    const deleted = await change(t, "DELETE", `/api/events/${id}?scope=following&date=2026-11-17`);
    expect(deleted.change?.summary).toBe("Muscu supprimée");
    expect(t.stores.calendarEvent.get(id)).toBeUndefined();
  });

  it("deletes a one-off event whatever the scope", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", { ...strength, kind: "revision", recurrence: "none" });
    const [event] = t.stores.calendarEvent.list();
    await t.call("DELETE", `/api/events/${event?.id}?scope=all`);
    expect(t.stores.calendarEvent.list()).toHaveLength(0);
  });

  it("repeats a biweekly session every other week until its last day", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", { ...strength, recurrence: "biweekly", until: "2026-12-10" });
    const count = async (week: string) =>
      weekSchema.parse((await t.call("GET", `/api/weeks/${week}`)).json).days.flatMap((d) => d.events).length;
    expect([
      await count("2026-W47"),
      await count("2026-W48"),
      await count("2026-W49"),
      await count("2026-W51"),
    ]).toEqual([1, 0, 1, 0]);
  });

  it("marks a class « n'a pas lieu », keeps it visible and frees its slot for the coach", async () => {
    const t = await ready();
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
    expect(t.services.plan.coachState().events).toHaveLength(1);

    const cancelled = await change(t, "POST", "/api/events/ics:1/cancel");
    expect(cancelled.change?.summary).toBe("Cours marqué « n'a pas lieu »");
    expect(t.services.plan.coachState().events).toHaveLength(0);
    expect(todaySchema.parse((await t.call("GET", "/api/today")).json).events).toHaveLength(0);

    expect((await t.call("PATCH", "/api/events/ics:1", { title: "x" })).status).toBe(403);
    expect((await t.call("DELETE", "/api/events/ics:1?scope=all")).status).toBe(403);

    await undo(t, cancelled.change?.id);
    expect(t.stores.calendarEvent.get("ics:1")?.cancelled).toBe(false);

    // "Le cours a lieu finalement", after the banner is gone.
    await change(t, "POST", "/api/events/ics:1/cancel");
    const restored = await change(t, "DELETE", "/api/events/ics:1/cancel");
    expect(restored.change?.summary).toBe("Cours remis à ta semaine");
    expect(t.stores.calendarEvent.get("ics:1")?.cancelled).toBe(false);
  });

  it("only cancels classes, and says so", async () => {
    const t = await ready();
    await t.call("POST", "/api/events", strength);
    const [event] = t.stores.calendarEvent.list();
    expect((await t.call("POST", `/api/events/${event?.id}/cancel`)).status).toBe(400);
    expect((await t.call("DELETE", `/api/events/${event?.id}/cancel`)).status).toBe(400);
    expect((await t.call("POST", "/api/events/nope/cancel")).status).toBe(404);
  });
});

describe("moving a session", () => {
  it("moves it, marks it manual, and Annuler puts it back", async () => {
    const t = await ready();
    t.stores.plannedSession.put(session("q", "2026-11-19T18:00", { type: "I" }));

    const moved = await change(t, "POST", "/api/sessions/q/move", { start: "2026-11-18T18:00" });

    expect(moved.change?.summary).toBe("Séance déplacée à mercredi 18:00");
    expect(t.stores.plannedSession.get("q")).toMatchObject({ start: "2026-11-18T18:00", manual: true });
    await undo(t, moved.change?.id);
    expect(t.stores.plannedSession.get("q")).toMatchObject({ start: "2026-11-19T18:00", manual: false });
  });

  it("passes on the coach's one-line warning when Anna forces a slot", async () => {
    const t = await ready();
    t.stores.plannedSession.put(session("q", "2026-11-19T18:00"));
    const moved = await change(t, "POST", "/api/sessions/q/move", { start: "2026-11-20T06:00" });
    expect(moved.warnings).toEqual(["Avant ton heure de début"]);
  });

  it("refuses the past, far weeks, done sessions and unknown ones", async () => {
    const t = await ready();
    t.stores.plannedSession.put(session("q", "2026-11-19T18:00"));
    t.stores.plannedSession.put(session("done", "2026-11-16T07:00", { status: "done" }));
    expect((await t.call("POST", "/api/sessions/q/move", { start: "2026-11-16T07:00" })).status).toBe(400);
    expect((await t.call("POST", "/api/sessions/q/move", { start: "2026-12-02T18:00" })).status).toBe(400);
    expect((await t.call("POST", "/api/sessions/done/move", { start: "2026-11-18T18:00" })).status).toBe(403);
    expect((await t.call("POST", "/api/sessions/nope/move", { start: "2026-11-18T18:00" })).status).toBe(404);
    expect((await t.call("POST", "/api/sessions/q/move", { start: "demain" })).status).toBe(400);
  });

  it("proposes slots from the coach, with side effects", async () => {
    const t = await ready();
    t.stores.plannedSession.put(session("q", "2026-11-19T18:00"));
    t.stores.plannedSession.put(session("e", "2026-11-20T18:00"));
    expect((await t.call("GET", "/api/sessions/q/slots")).json).toEqual({
      best: [{ slot: { start: "2026-11-18T18:00", end: "2026-11-18T18:45" }, reason: "même heure, mercredi" }],
      forbidden: [],
      sideEffects: ["Ton footing de jeudi passe à vendredi"],
    });
    expect((await t.call("GET", "/api/sessions/nope/slots")).status).toBe(404);
  });
});

describe("settings", () => {
  it("starts from the defaults of the spec, then saves a patch Annuler can undo", async () => {
    const t = await ready();
    expect(profileSchema.parse((await t.call("GET", "/api/profile")).json).runsPerWeek).toBe(3);

    const saved = await change(t, "PATCH", "/api/profile", { runsPerWeek: 4, bedtime: "22:30" });
    expect(saved.change?.summary).toBe("Réglages enregistrés");
    expect((await t.call("GET", "/api/profile")).json).toMatchObject({ runsPerWeek: 4, bedtime: "22:30" });

    await undo(t, saved.change?.id);
    expect((await t.call("GET", "/api/profile")).json).toMatchObject({ runsPerWeek: 3, bedtime: "23:00" });
  });

  it("rejects an invalid setting", async () => {
    const t = await ready();
    expect((await t.call("PATCH", "/api/profile", { runsPerWeek: 9 })).status).toBe(400);
  });

  it("sets a goal and rebuilds the next week through the coach", async () => {
    const t = await ready();
    expect((await t.call("GET", "/api/program")).json).toEqual({ goal: null });
    const goal = { distanceM: 21097.5, date: "2027-03-14", targetMin: 110 };

    const saved = await change(t, "PUT", "/api/program", { goal });

    expect(saved.change?.summary).toBe("Objectif modifié");
    expect((await t.call("GET", "/api/program")).json).toEqual({ goal });
    expect(t.stores.plannedSession.get("built-2026-11-23")).toBeDefined();
    await undo(t, saved.change?.id);
    expect(t.stores.plannedSession.get("built-2026-11-23")).toBeUndefined();
  });

  it("builds next week on Sunday through the coach", async () => {
    const t = setup();
    expect((await t.services.plan.buildNextWeek()).change?.summary).toBe("Ta semaine est prête");
  });
});

describe("undo", () => {
  it("refuses to undo twice, an unknown change, or one a later change built on", async () => {
    const t = await ready();
    t.stores.plannedSession.put(session("q", "2026-11-19T18:00"));
    const first = await change(t, "POST", "/api/sessions/q/move", { start: "2026-11-18T18:00" });
    const second = await change(t, "POST", "/api/sessions/q/move", { start: "2026-11-20T18:00" });

    expect((await undo(t, first.change?.id)).status).toBe(409);
    expect((await undo(t, second.change?.id)).status).toBe(200);
    expect((await undo(t, second.change?.id)).status).toBe(409);
    expect((await undo(t, first.change?.id)).status).toBe(200);
    expect(t.stores.plannedSession.get("q")?.start).toBe("2026-11-19T18:00");
    expect((await undo(t, "nope")).status).toBe(404);
  });

  it("records nothing when an action changes nothing", async () => {
    const t = await ready();
    await t.call("PATCH", "/api/profile", { runsPerWeek: 4 });
    expect((await change(t, "PATCH", "/api/profile", { runsPerWeek: 4 })).change).toBeNull();
  });
});
