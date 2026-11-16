import type { CalendarEvent, SessionView } from "@talaria/protocol";
import { describe, expect, it, vi } from "vitest";
import { ApiError, errorMessage } from "./errors.ts";
import { createHttpApi, isHealthy, sse } from "./http.ts";
import { mockRequest, pickApi } from "./index.ts";
import { toGoal, toMoveOptions, toPreviewRows, toProfilePatch, toUnavailable } from "./map.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const SESSION: SessionView = {
  id: "s1",
  type: "I",
  start: "2026-11-16T18:00",
  durMin: 50,
  steps: [
    { kind: "warmup", durMin: 15, target: {} },
    { kind: "work", distM: 800, reps: 6, target: { paceSKm: [295, 295] } },
    { kind: "recover", durMin: 2, target: {} },
    { kind: "cooldown", durMin: 10, target: { paceSKm: [405, 375] } },
  ],
  rpeTarget: 8,
  priority: 1,
  status: "planned",
  manual: false,
  frozen: false,
  pilot: "pace",
  watch: "failed",
};
const CLASS: CalendarEvent = {
  id: "ics:1",
  kind: "class",
  title: "Maths",
  start: "2026-11-16T08:00",
  end: "2026-11-16T10:00",
  manual: false,
  cancelled: false,
  recurrence: "none",
  exceptions: [],
};
const STRENGTH: CalendarEvent = {
  ...CLASS,
  id: "legs",
  kind: "strength",
  title: "Jambes",
  start: "2026-11-17T19:00",
  end: "2026-11-17T20:00",
  legs: true,
  manual: true,
  recurrence: "weekly",
};
const EASY: SessionView = { ...SESSION, id: "s2", type: "E", start: "2026-11-18T07:30", steps: [], watch: null };
const WEEK = {
  week: "2026-W47",
  readOnly: false,
  days: [
    { date: "2026-11-16", sessions: [SESSION], events: [CLASS] },
    { date: "2026-11-17", sessions: [], events: [STRENGTH] },
    { date: "2026-11-18", sessions: [EASY], events: [] },
  ],
};
const CHANGE = { change: { id: "c1", summary: "Fractionné déplacé à mercredi 18:00" }, warnings: [] };
const PROFILE = {
  runsPerWeek: 3,
  earliest: "07:00",
  latestEnd: "21:30",
  noRunDays: [7],
  bedtime: "23:00",
  useSleepHr: true,
  travelMin: 0,
  cycleTracking: false,
  icsUrl: "https://edt.univ.fr/anna.ics",
};

/** A fake server: "METHOD /path" to the JSON it answers, 404 for anything else. */
function server(routes: Record<string, unknown> = {}) {
  const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const key = `${init?.method ?? "GET"} ${String(url)}`;
    return key in routes ? json(routes[key]) : json({ error: "Route inconnue" }, 404);
  });
  const onSignedOut = vi.fn();
  const api = createHttpApi(fetcher, onSignedOut, () => new Date(2026, 10, 16, 9));
  const sent = (key: string) => {
    const call = fetcher.mock.calls.find(([url, init]) => `${init?.method} ${String(url)}` === key);
    return call?.[1]?.body ? JSON.parse(String(call[1].body)) : undefined;
  };
  return { api, fetcher, onSignedOut, sent };
}

const reads = {
  "GET /api/today": { date: "2026-11-16", session: SESSION, events: [CLASS], activity: null },
  "GET /api/watch": { configured: true, lastSyncAt: "2026-11-16T07:55:00.000Z" },
  "GET /api/program": { goal: { distanceM: 21097.5, date: "2027-01-17", targetMin: 115 } },
  "GET /api/weeks/2026-W47": WEEK,
  "GET /api/weeks/2026-W48": { week: "2026-W48", readOnly: false, days: [] },
  "GET /api/timetable": { lastSyncAt: "2026-11-16T07:00:00.000Z" },
  "GET /api/profile": PROFILE,
  "GET /api/proposals": [
    {
      id: "p1",
      kind: "vdot",
      from: 40,
      to: 41,
      ruleId: "RC3",
      evidence: [],
      expiresOn: "2026-11-20",
      status: "pending",
    },
    {
      id: "p2",
      kind: "vdot",
      from: 40,
      to: 39,
      ruleId: "RC4",
      evidence: [],
      expiresOn: "2026-11-20",
      status: "pending",
    },
    {
      id: "p3",
      kind: "test",
      from: 40,
      to: 40,
      ruleId: "RC5",
      evidence: [],
      expiresOn: "2026-11-20",
      status: "pending",
    },
    {
      id: "p4",
      kind: "goal",
      from: 110,
      to: 115,
      ruleId: "G1",
      evidence: [],
      expiresOn: "2026-11-20",
      status: "pending",
    },
  ],
};

describe("api selection", () => {
  it("reads the mock flag and scenario", () => {
    expect(mockRequest("", undefined)).toBeUndefined();
    expect(mockRequest("", "1")).toBe("run");
    expect(mockRequest("?mock", undefined)).toBe("run");
    expect(mockRequest("?mock=rest", undefined)).toBe("rest");
    expect(mockRequest("?mock=nimporte", undefined)).toBe("run");
  });

  it("always uses the server in production, without a health probe", async () => {
    const fetcher = vi.fn();
    expect((await pickApi("", fetcher, false)).mode).toBe("server");
    expect(fetcher).not.toHaveBeenCalled();
    expect((await pickApi("?mock=done", fetcher, false)).mode).toBe("mock");
  });

  it("in development, uses the server when it answers and the mock otherwise", async () => {
    expect(
      (
        await pickApi(
          "",
          vi.fn(async () => json({ status: "ok", version: "1" })),
          true,
        )
      ).mode,
    ).toBe("server");
    expect(
      (
        await pickApi(
          "",
          vi.fn(async () => new Response("<html>")),
          true,
        )
      ).mode,
    ).toBe("mock");
    expect(
      (
        await pickApi(
          "",
          vi.fn(async () => json({ hello: 1 })),
          true,
        )
      ).mode,
    ).toBe("mock");
    expect(
      (
        await pickApi(
          "",
          vi.fn(() => Promise.reject(new Error("offline"))),
          true,
        )
      ).mode,
    ).toBe("mock");
    expect(isHealthy({ status: "ok", version: "2" })).toBe(true);
  });
});

describe("http client, reading", () => {
  it("maps today: the run, its steps and paces, the watch status, the countdown and the next run", async () => {
    const { api } = server(reads);
    const today = await api.today();
    expect(today.goal).toEqual({ label: "Semi", daysLeft: 62 });
    expect(today.session).toMatchObject({
      id: "s1",
      title: "Fractionné",
      intensity: "hard",
      date: "2026-11-16",
      start: "18:00",
      mainSet: "6 × 800 m",
      pace: "4:55",
      watch: "failed",
    });
    expect(today.session?.steps).toEqual([
      { label: "Échauffement 15 min", pace: "", tone: "plain" },
      { label: "6 × 800 m", pace: "4:55", tone: "hard" },
      { label: "Récupération 2 min", pace: "", tone: "muted" },
      { label: "Retour au calme 10 min", pace: "6:15 à 6:45", tone: "plain" },
    ]);
    expect(today.proposals?.map((p) => p.text.split(" :")[0])).toEqual([
      "Tes dernières séances clés sont bien passées",
      "Tes dernières séances clés ont été dures",
      "Je propose un test pour recaler tes allures.",
      "Ton chrono visé semble à revoir",
    ]);
    expect(today.next).toMatchObject({
      id: "s2",
      title: "Footing",
      intensity: "easy",
      start: "7:30",
      watch: undefined,
    });
  });

  it("shows today's run once done, asking the feel only when the watch did not", async () => {
    const run = { id: "garmin:1", start: "2026-11-16T18:02", durMin: 51.2, distM: 8300, sessionId: "s1" };
    const done = { ...SESSION, status: "done" };
    const today = await server({
      ...reads,
      "GET /api/today": { date: "2026-11-16", session: done, events: [], activity: run },
    }).api.today();
    expect(today.activity).toEqual({
      id: "garmin:1",
      title: "Fractionné",
      receivedAt: "18:02",
      distanceKm: 8.3,
      duration: "51:12",
      mainPaceLabel: "Allure moyenne",
      mainPace: "6:10",
      verdict: "Prévu 50 min, fait en 51 min",
      askFeel: true,
      feel: undefined,
    });
    const answered = await server({
      ...reads,
      "GET /api/today": { date: "2026-11-16", session: null, events: [], activity: { ...run, answeredFeel: "ok" } },
    }).api.today();
    expect(answered.activity).toMatchObject({ title: "Course libre", feel: "fine", askFeel: true });
    const morning = await server({
      ...reads,
      "GET /api/today": {
        date: "2026-11-16",
        session: SESSION,
        events: [],
        activity: { ...run, sessionId: undefined },
      },
    }).api.today();
    expect(morning.activity).toBeUndefined();
  });

  it("asks once for a week that Aujourd'hui and the week both need at launch", async () => {
    const { api, fetcher } = server(reads);
    await Promise.all([api.today(), api.week(0)]);
    const weekCalls = () => fetcher.mock.calls.filter(([url]) => String(url) === "/api/weeks/2026-W47").length;
    expect(weekCalls()).toBe(1);
    await api.week(0);
    expect(weekCalls()).toBe(2);
  });

  it("maps a week from its ISO number, with classes, strength and the last timetable read", async () => {
    const { api, fetcher } = server(reads);
    const week = await api.week(0);
    expect(fetcher).toHaveBeenCalledWith("/api/weeks/2026-W47", expect.objectContaining({ method: "GET" }));
    expect(week.monday).toBe("2026-11-16");
    expect(week.timetableCheckedAt).toBe("2026-11-16T07:00:00.000Z");
    expect(week.items.map((i) => [i.kind, i.date, i.start])).toEqual([
      ["run", "2026-11-16", "18:00"],
      ["class", "2026-11-16", "8:00"],
      ["strength", "2026-11-17", "19:00"],
      ["run", "2026-11-18", "7:30"],
    ]);
  });

  it("maps the program: goal, settings, strength templates and the ICS link", async () => {
    const program = await server(reads).api.program();
    expect(program.goal).toMatchObject({ race: "Semi-marathon", date: "2027-01-17", targetTime: "1:55:00" });
    expect(program.maintenance).toBe(false);
    expect(program.settings).toMatchObject({ runsPerWeek: 3, noRunDays: [6], notBefore: "7:00", notAfter: "21:30" });
    expect(program.strength).toEqual([
      {
        id: "legs",
        name: "Jambes",
        legs: true,
        weekday: 1,
        start: "19:00",
        durationMin: 60,
        repeat: "weekly",
        placed: true,
      },
    ]);
    expect(program.timetableUrl).toBe("https://edt.univ.fr/anna.ics");
    expect(program.watch).toEqual({
      model: "Garmin vivoactive 4",
      connected: false,
      lastSync: "2026-11-16T07:55:00.000Z",
    });
    const maintenance = await server({ ...reads, "GET /api/program": { goal: null } }).api.program();
    expect(maintenance.maintenance).toBe(true);
  });

  it("maps move slots, keeping a day open when one of its times is allowed", () => {
    const at = (start: string) => ({ start, end: start });
    const options = toMoveOptions({
      best: [{ slot: at("2026-11-18T18:00"), reason: "même heure, mercredi" }],
      forbidden: [
        { slot: at("2026-11-18T07:00"), reason: "trop tôt" },
        { slot: at("2026-11-19T18:00"), reason: "Moins de 24 h après ta séance jambes" },
      ],
      sideEffects: ["Ton footing de jeudi passe à vendredi"],
    });
    expect(options.slots).toEqual([
      {
        date: "2026-11-18",
        start: "18:00",
        why: "même heure, mercredi",
        consequence: "Ton footing de jeudi passe à vendredi",
      },
    ]);
    expect(options.blocked).toEqual([{ date: "2026-11-19", reason: "Moins de 24 h après ta séance jambes" }]);
  });
});

describe("http client, changes", () => {
  it("sends each action to its route and returns the change Annuler needs", async () => {
    const { api, sent } = server({
      "POST /api/sessions/a%2Fb/move": CHANGE,
      "PATCH /api/events/legs": { change: null, warnings: [] },
      "POST /api/sessions/s1/change": { ...CHANGE, warnings: ["Avant ton heure de début"] },
      "DELETE /api/events/rev?scope=occurrence&date=2026-11-18": CHANGE,
      "DELETE /api/events/legs?scope=following&date=2026-11-17": CHANGE,
      "POST /api/events/ics%3A1/cancel": CHANGE,
      "DELETE /api/events/ics%3A1/cancel": CHANGE,
      "POST /api/changes/c1/undo": { id: "c1", summary: "x" },
      "POST /api/feel-better": CHANGE,
      "POST /api/proposals/p1/accept": { change: { id: "c2", summary: "Allures mises à jour" }, warnings: [] },
      "POST /api/proposals/p1/decline": CHANGE,
      "POST /api/unavailable": CHANGE,
    });
    expect(await api.move("a/b", { date: "2026-11-18", start: "18:00" })).toEqual({
      changeId: "c1",
      message: "Fractionné déplacé à mercredi 18:00",
      rows: [],
    });
    expect(sent("POST /api/sessions/a%2Fb/move")).toEqual({ start: "2026-11-18T18:00" });

    const strength = {
      id: "legs",
      kind: "strength",
      date: "2026-11-17",
      start: "19:00",
      end: "20:00",
      title: "J",
    } as const;
    expect(await api.move("legs", { date: "2026-11-19", start: "7:30" }, strength)).toMatchObject({ changeId: "" });
    expect(sent("PATCH /api/events/legs")).toEqual({ start: "2026-11-19T07:30", end: "2026-11-19T08:30" });

    expect((await api.change("s1", "jog")).message).toBe(
      "Fractionné déplacé à mercredi 18:00 · Avant ton heure de début",
    );
    expect(sent("POST /api/sessions/s1/change")).toEqual({ option: "jog30" });

    await api.deleteEvent("rev", "one", "2026-11-18");
    await api.deleteStrength("legs", "all", "2026-11-17");
    await api.updateEvent("ics:1", { cancelled: true });
    await api.updateEvent("ics:1", { cancelled: false });
    await api.undo("c1");
    await api.feelBetter();
    expect(await api.acceptProposal("p1")).toMatchObject({ changeId: "c2", message: "Allures mises à jour" });
    await api.declineProposal("p1");
    await api.skip("s1");
    expect(sent("POST /api/unavailable")).toEqual({ reason: "no_time" });
  });

  it("creates or updates a strength template, on its next day", async () => {
    const { api, sent } = server({ "POST /api/events": CHANGE, "PATCH /api/events/legs": CHANGE });
    const template = {
      id: "legs",
      name: "Jambes",
      legs: true,
      weekday: 0,
      start: "19:00",
      durationMin: 60,
      repeat: "weekly",
      placed: true,
    } as const;
    await api.saveStrength(template, true);
    expect(sent("PATCH /api/events/legs")).toEqual({
      title: "Jambes",
      legs: true,
      start: "2026-11-16T19:00",
      end: "2026-11-16T20:00",
      recurrence: "weekly",
    });
    await api.saveStrength({ ...template, id: "s-1" });
    expect(sent("POST /api/events")).toMatchObject({ kind: "strength", recurrence: "weekly" });
  });

  it("saves settings, the goal and the ICS link in the server's shapes", async () => {
    const refresh = {
      lastSyncAt: "2026-11-16T08:00:00.000Z",
      added: 1,
      changed: 0,
      removed: 0,
      summary: "",
      change: null,
    };
    const { api, sent } = server({
      "PATCH /api/profile": CHANGE,
      "PUT /api/program": CHANGE,
      "PUT /api/timetable/url": refresh,
      "POST /api/watch/sync": null,
    });
    await api.updateSettings({ notBefore: "6:30", noRunDays: [0, 6], cycle: true });
    expect(sent("PATCH /api/profile")).toEqual({ earliest: "06:30", noRunDays: [1, 7], cycleTracking: true });
    await api.updateGoal({ race: "Semi-marathon", distanceKm: 21.1, date: "2027-01-17", targetTime: "1:48" });
    expect(sent("PUT /api/program")).toEqual({ goal: { distanceM: 21097.5, date: "2027-01-17", targetMin: 108 } });
    expect(await api.setTimetableUrl("https://edt.univ.fr/anna.ics")).toEqual({
      checkedAt: "2026-11-16T08:00:00.000Z",
      summary: undefined,
    });
    expect(sent("PUT /api/timetable/url")).toEqual({ url: "https://edt.univ.fr/anna.ics" });
    await api.resendToWatch("s1");
  });

  it("maps the other inputs: settings out of range, goals, Pas dispo", () => {
    expect(() => toProfilePatch({ runsPerWeek: 2 })).toThrow("entre 3 et 5");
    expect(toProfilePatch({ runsPerWeek: 4, recoveryData: false, bedtime: "23:30", notAfter: "21:00" })).toEqual({
      runsPerWeek: 4,
      useSleepHr: false,
      bedtime: "23:30",
      latestEnd: "21:00",
    });
    expect(toGoal({ race: "10 km", distanceKm: 10, date: "2027-03-01", targetTime: "0:52:30" })).toEqual({
      distanceM: 10000,
      date: "2027-03-01",
      targetMin: 52.5,
    });
    expect(toGoal({ race: "Marathon", distanceKm: 42.2, date: "2027-04-01" }).targetMin).toBeUndefined();
    expect(toUnavailable({ sessionId: "s1", reason: "pain", zone: "Genou", pain: 5, until: "2026-11-20" })).toEqual({
      reason: "pain",
      where: "genou",
      walking0to10: 5,
      until: "2026-11-20",
    });
    expect(toUnavailable({ sessionId: "s1", reason: "sick" })).toEqual({ reason: "sick", feverOrChest: false });
    expect(toUnavailable({ sessionId: "s1", reason: "tired" })).toEqual({ reason: "tired" });
    const preview = {
      days: [
        { date: "2026-11-16", before: SESSION, after: { ...EASY, durMin: 20 } },
        { date: "2026-11-17", before: SESSION, after: null },
      ],
      warnings: ["Repos ou vélo conseillé"],
    };
    expect(toPreviewRows(preview, "2026-11-16")).toEqual([
      { day: "Aujourd'hui", label: "Footing · 20 min", tone: "easy" },
      { day: "Demain", label: "Repos", tone: "rest" },
      { day: "Conseil", label: "Repos ou vélo conseillé", tone: "other" },
    ]);
  });

  it("asks the server for Pas dispo's summary without changing anything", async () => {
    const { api, sent } = server({
      "POST /api/unavailable/preview": { days: [], warnings: ["Repos conseillé tant que tu as de la fièvre"] },
    });
    const rows = await api.previewUnavailable({ sessionId: "s1", reason: "sick", fever: true });
    expect(sent("POST /api/unavailable/preview")).toEqual({ reason: "sick", feverOrChest: true });
    expect(rows).toEqual([{ day: "Conseil", label: "Repos conseillé tant que tu as de la fièvre", tone: "other" }]);
  });
});

describe("http client, errors", () => {
  it("asks for the login link on a 401", async () => {
    const fetcher = vi.fn(async () => json({ error: "Connexion requise" }, 401));
    const onSignedOut = vi.fn();
    const error = await createHttpApi(fetcher, onSignedOut)
      .today()
      .catch((e: unknown) => e);
    expect(onSignedOut).toHaveBeenCalled();
    expect(errorMessage(error)).toBe("Ouvre le lien de connexion que tu as reçu.");
  });

  it("shows the server's French message, or says what to do", async () => {
    const { api } = server();
    await expect(api.undo("c9")).rejects.toThrow("Route inconnue");
    const html = createHttpApi(vi.fn(async () => new Response("<html>", { status: 200 })));
    await expect(html.week(0)).rejects.toThrow("recharge l'app");
    const down = createHttpApi(vi.fn(async () => new Response("", { status: 503 })));
    await expect(down.feelBetter()).rejects.toThrow("Le serveur a répondu 503");
    const offline = createHttpApi(vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
    await expect(offline.feelBetter()).rejects.toThrow("vérifie ton réseau");
    await expect(api.logFeel("a1", "easy")).rejects.toBeInstanceOf(ApiError);
    const feel = server({ "POST /api/activities/garmin%3A1/feel": null });
    await feel.api.logFeel("garmin:1", "fine");
    expect(feel.sent("POST /api/activities/garmin%3A1/feel")).toEqual({ feel: "ok" });
    expect(errorMessage(new Error("boom"))).toBe("Ça n'a pas marché. Réessaie dans un instant.");
  });
});

/** A body that arrives in awkward chunks, as a real network does. */
function chunked(text: string, size = 7) {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const bytes = new TextEncoder().encode(text);
      for (let i = 0; i < bytes.length; i += size) controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
}

const event = (data: unknown) => `event: x\ndata: ${JSON.stringify(data)}\n\n`;

describe("Reggie over the server", () => {
  const done = {
    id: "m9",
    at: "2026-11-16T08:00:00.000Z",
    role: "reggie",
    text: "C'est déplacé.",
    widgets: [
      { type: "change", changeId: "c1", summary: "Fractionné déplacé", warnings: [] },
      { type: "choices", options: ["Oui", "Non"] },
    ],
  };

  it("streams typing, text, Je vérifie, then one message per widget under the draft's id", async () => {
    const body = [
      event({ type: "typing" }),
      event({ type: "widget", widget: { type: "checking" } }),
      event({ type: "text", delta: "C'est " }),
      event({ type: "text", delta: "déplacé." }),
      event({ type: "done", message: done }),
    ].join("");
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(chunked(body)));
    const api = createHttpApi(fetcher, undefined, () => new Date(5));
    const events = [];
    for await (const e of api.chat({ text: "Décale", context: { screen: "today", sessionId: "s1" } })) events.push(e);
    expect(events).toEqual([
      { type: "status", status: "thinking" },
      { type: "status", status: "searching" },
      { type: "message", message: { id: "reggie-5", role: "reggie", text: "C'est " } },
      { type: "message", message: { id: "reggie-5", role: "reggie", text: "C'est déplacé." } },
      {
        type: "message",
        message: {
          id: "reggie-5",
          role: "reggie",
          text: "C'est déplacé.",
          widget: { type: "change", change: { changeId: "c1", message: "Fractionné déplacé", rows: [] } },
        },
      },
      {
        type: "message",
        message: {
          id: "reggie-5-1",
          role: "reggie",
          text: "",
          widget: { type: "choices", label: "Ta réponse", options: ["Oui", "Non"] },
        },
      },
    ]);
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      text: "Décale",
      context: { screen: "today", sessionId: "s1" },
    });
  });

  it("turns a stream error into Reggie's French message", async () => {
    const api = createHttpApi(vi.fn(async () => new Response(chunked(event({ type: "error", error: "Reggie dort" })))));
    const run = async () => {
      for await (const _ of api.chat({ text: "Salut" })) {
        // drained
      }
    };
    await expect(run()).rejects.toThrow("Reggie dort");
  });

  it("maps the history and every widget kind", async () => {
    const session = { ...SESSION, type: "E" } as const;
    const { api } = server({
      "GET /api/chat": {
        messages: [
          { id: "m1", at: "x", role: "anna", text: "J'ai mal", widgets: [] },
          {
            id: "m2",
            at: "x",
            role: "reggie",
            text: "Combien ?",
            widgets: [
              { type: "slider", label: "Douleur", min: 0, max: 10 },
              {
                type: "slots",
                sessionId: "s1",
                slots: [{ slot: { start: "2026-11-18T18:00", end: "2026-11-18T18:50" }, reason: "mercredi" }],
              },
              { type: "session_preview", sessionId: "s1", option: "jog30", session },
            ],
          },
        ],
      },
    });
    const history = await api.chatHistory();
    expect(history.map((m) => [m.id, m.role, m.widget?.type])).toEqual([
      ["m1", "user", undefined],
      ["m2", "reggie", "scale"],
      ["m2-1", "reggie", "slots"],
      ["m2-2", "reggie", "preview"],
    ]);
    expect(history[2]?.widget).toMatchObject({ slots: [{ date: "2026-11-18", start: "18:00", why: "mercredi" }] });
    expect(history[3]?.widget).toMatchObject({ optionId: "jog", session: { title: "Footing", intensity: "easy" } });
  });

  it("splits server-sent events whatever the chunks", async () => {
    const out = [];
    for await (const data of sse(chunked(': ping\n\nevent: a\ndata: {"a":1}\r\n\r\ndata: {"b":2}\n\n', 3)))
      out.push(data);
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });
});

describe("push over the server", () => {
  it("validates the browser's subscription before sending it", async () => {
    const { api, sent } = server({
      "GET /api/push/key": { publicKey: "BKey" },
      "POST /api/push/subscriptions": null,
      "DELETE /api/push/subscriptions": null,
    });
    expect(await api.pushKey()).toBe("BKey");
    const subscription = {
      endpoint: "https://push.apple.com/x",
      keys: { p256dh: "p", auth: "a" },
      expirationTime: null,
    };
    await api.subscribePush(subscription);
    expect(sent("POST /api/push/subscriptions")).toEqual({
      endpoint: "https://push.apple.com/x",
      keys: { p256dh: "p", auth: "a" },
    });
    await expect(api.subscribePush({ endpoint: "http://x" })).rejects.toThrow("illisible");
    await api.unsubscribePush("https://push.apple.com/x");
    expect(sent("DELETE /api/push/subscriptions")).toEqual({ endpoint: "https://push.apple.com/x" });
  });
});
