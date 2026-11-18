import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client.ts";
import { ApiError } from "../api/errors.ts";
import { createMockApi } from "../api/mock/index.ts";
import { createPlanStore, isStale, STALE_MS } from "./plan/store.ts";
import { createChatStore } from "./reggie/store.ts";
import { SHEET_CLOSE_MS, useSheet } from "./sheets/store.ts";

const MONDAY = "2026-11-16";
const RUN = `${MONDAY}-2`;

function setup() {
  const api = createMockApi({ monday: MONDAY });
  const notify = vi.fn();
  const plan = createPlanStore(async () => api, notify);
  return { api, notify, plan };
}

describe("plan store", () => {
  it("loads today and the current week", async () => {
    const { plan } = setup();
    await plan.getState().load();
    expect(plan.getState().status).toBe("ready");
    expect(plan.getState().today?.session?.id).toBe(RUN);
    expect(plan.getState().weeks[0]?.monday).toBe(MONDAY);
  });

  it("applies a change, shows the banner with Annuler, and undoes it", async () => {
    const { plan, notify } = setup();
    await plan.getState().load();
    const result = await plan.getState().apply((api) => api.move(RUN, { date: "2026-11-19", start: "18:00" }));
    // The banner comes with the server's answer; the screen follows a moment later.
    await vi.waitFor(() => expect(plan.getState().today?.session).toBeUndefined());
    expect(plan.getState().lastChangeId).toBe(result?.changeId);
    const [message, action] = notify.mock.lastCall ?? [];
    expect(message).toBe("Séance déplacée à jeudi 18:00");
    expect(action.label).toBe("Annuler");
    action.onClick();
    await vi.waitFor(() => expect(plan.getState().today?.session?.id).toBe(RUN));
    expect(plan.getState().lastChangeId).toBeUndefined();
    expect(notify).toHaveBeenLastCalledWith("Changement annulé");
  });

  it("uses a custom banner action, or none when quiet", async () => {
    const { plan, notify } = setup();
    const onClick = vi.fn();
    await plan
      .getState()
      .apply((api) => api.updateSettings({ runsPerWeek: 3 }), { action: { label: "Voir", onClick } });
    expect(notify).toHaveBeenLastCalledWith("Reggie a réorganisé ta semaine", { label: "Voir", onClick });
    notify.mockClear();
    await plan.getState().apply((api) => api.updateSettings({ cycle: true }), { quiet: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it("says when something fails, without losing the plan", async () => {
    const { plan, notify } = setup();
    await plan.getState().load();
    expect(await plan.getState().apply((api) => api.move("nope", { date: MONDAY, start: "9:00" }))).toBeUndefined();
    expect(notify).toHaveBeenLastCalledWith("Ça n'a pas marché. Réessaie dans un instant.");
    expect(await plan.getState().run(() => Promise.reject(new Error("x")))).toBe(false);
    await plan.getState().undo("nope");
    expect(plan.getState().today?.session?.id).toBe(RUN);
  });

  it("loads other weeks and the program, and refreshes them after a change", async () => {
    const { plan } = setup();
    await plan.getState().loadWeek(1);
    await plan.getState().loadProgram();
    expect(await plan.getState().run((api) => api.updateSettings({ runsPerWeek: 5 }))).toBe(true);
    expect(plan.getState().program?.settings.runsPerWeek).toBe(5);
    expect(plan.getState().weeks[1]?.monday).toBe("2026-11-23");
  });

  it("reports a load error, and shows the wait again on Réessayer", async () => {
    localStorage.clear();
    const plan = createPlanStore(() => Promise.reject(new Error("offline")), vi.fn());
    await plan.getState().load();
    expect(plan.getState().status).toBe("error");
    const retry = plan.getState().load();
    expect(plan.getState().status).toBe("loading");
    await retry;
    expect(plan.getState().status).toBe("error");
  });

  // Semaine and Programme stayed blank forever when their read failed (audit robustesse 1).
  it("tells Semaine and Programme when their read is pending or failed, and keeps a week already shown", async () => {
    const api = createMockApi({ monday: MONDAY });
    let down = true;
    const plan = createPlanStore(async () => {
      if (down) throw new Error("offline");
      return api;
    }, vi.fn());
    const pending = plan.getState().loadWeek(1);
    expect(plan.getState().weekStatus[1]).toBe("loading");
    await pending;
    expect(plan.getState().weekStatus[1]).toBe("error");
    await plan.getState().loadProgram();
    expect(plan.getState().programStatus).toBe("error");
    down = false;
    await plan.getState().loadWeek(1);
    await plan.getState().loadProgram();
    expect(plan.getState().weekStatus[1]).toBe("ready");
    expect(plan.getState().programStatus).toBe("ready");
    down = true;
    await plan.getState().loadWeek(1);
    expect(plan.getState().weekStatus[1]).toBe("ready");
    expect(plan.getState().weeks[1]?.monday).toBe("2026-11-23");
  });

  // A double tap sent the move twice; the second "Rien n'a changé" took Annuler away (audit robustesse 4).
  it("sends a change once however many taps, and keeps Annuler on the change that happened", async () => {
    const { plan, api, notify } = setup();
    await plan.getState().load();
    const move = vi.spyOn(api, "move");
    const tap = () => plan.getState().apply((client) => client.move(RUN, { date: "2026-11-19", start: "18:00" }));
    const first = tap();
    expect(plan.getState().busy).toBe(true);
    expect(await tap()).toBeUndefined();
    const result = await first;
    expect(move).toHaveBeenCalledOnce();
    expect(plan.getState().busy).toBe(false);
    await plan.getState().apply(async () => ({ changeId: "", message: "Rien n'a changé", rows: [] }));
    expect(plan.getState().lastChangeId).toBe(result?.changeId);
    expect(notify.mock.calls.filter(([, action]) => action?.label === "Annuler")).toHaveLength(1);
  });

  it("shows only the latest read when reads overlap", async () => {
    const { plan, api } = setup();
    await plan.getState().load();
    let release: () => void = () => undefined;
    const slow = new Promise<void>((resolve) => {
      release = resolve;
    });
    const today = api.today.bind(api);
    vi.spyOn(api, "today").mockImplementationOnce(async () => {
      const old = await today();
      await slow;
      return { ...old, date: "2000-01-01" };
    });
    const older = plan.getState().refresh();
    await plan.getState().refresh();
    release();
    await older;
    expect(plan.getState().today?.date).toBe(MONDAY);
  });

  it("is stale on another day or after five minutes", () => {
    const now = new Date(2026, 10, 16, 23, 50);
    const today = { date: "2026-11-16" } as Parameters<typeof isStale>[0]["today"];
    expect(isStale({ today, loadedAt: now.getTime() }, now)).toBe(false);
    expect(isStale({ today, loadedAt: now.getTime() - STALE_MS - 1 }, now)).toBe(true);
    expect(isStale({ today, loadedAt: now.getTime() }, new Date(2026, 10, 17, 0, 1))).toBe(true);
    expect(isStale({ loadedAt: now.getTime() }, now)).toBe(true);
  });

  it("paints today's last copy at launch, even offline, and never yesterday's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 16, 9));
    localStorage.clear();
    const { plan } = setup();
    await plan.getState().load();
    await vi.waitFor(() => expect(localStorage.getItem("annarrive.firstScreen")).toContain(RUN));

    const offline = createPlanStore(() => Promise.reject(new Error("offline")), vi.fn());
    await offline.getState().load();
    expect(offline.getState().status).toBe("ready");
    expect(offline.getState().today?.session?.id).toBe(RUN);
    expect(offline.getState().weeks[0]?.monday).toBe(MONDAY);

    vi.setSystemTime(new Date(2026, 10, 17, 9));
    const nextDay = createPlanStore(() => Promise.reject(new Error("offline")), vi.fn());
    await nextDay.getState().load();
    expect(nextDay.getState().status).toBe("error");
    vi.useRealTimers();
  });
});

describe("chat store", () => {
  it("sends, shows Reggie's widgets and records the answer", async () => {
    const { api } = setup();
    const onChange = vi.fn(async () => undefined);
    const chat = createChatStore(async () => api, onChange);
    chat.getState().setContext("Fractionné, ce soir 18:00");
    await chat.getState().send("Je suis malade");
    const question = chat.getState().messages.at(-1);
    expect(question?.widget?.type).toBe("choices");
    expect(chat.getState().status).toBe("idle");
    await chat.getState().answer(question?.id ?? "", "Non");
    expect(chat.getState().messages.find((m) => m.id === question?.id)?.answer).toBe("Non");
    const change = chat.getState().messages.at(-1);
    expect(change?.widget?.type).toBe("change");
    expect(onChange).toHaveBeenCalledOnce();
    chat.getState().undone(change?.id ?? "");
    expect(chat.getState().messages.at(-1)?.answer).toBe("undone");
  });

  it("ignores empty messages and says when Reggie cannot answer", async () => {
    const broken: Pick<Api, "chat"> = {
      chat: () => ({
        [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new Error("offline")) }),
      }),
    };
    const chat = createChatStore(async () => broken as Api, vi.fn());
    await chat.getState().send("   ");
    expect(chat.getState().messages).toHaveLength(1);
    await chat.getState().send("Salut");
    const failed = chat.getState().messages.at(-1);
    expect(failed?.text).toMatch(/^Je n'arrive pas/);
    // Réessayer sends the same words again, in place of the failed pair.
    await chat.getState().retry(failed?.id ?? "");
    expect(chat.getState().messages.map((m) => m.text)).toEqual([
      expect.stringMatching(/^Salut/),
      "Salut",
      expect.stringMatching(/^Je n'arrive pas/),
    ]);
  });

  it("grows the streamed message in place, sends the context, and shows the server's own error", async () => {
    const sent: unknown[] = [];
    const api: Pick<Api, "chat"> = {
      async *chat(input) {
        sent.push(input);
        yield { type: "message", message: { id: "r1", role: "reggie", text: "Je " } };
        yield { type: "message", message: { id: "r1", role: "reggie", text: "Je regarde." } };
        throw new ApiError(502, "Reggie ne répond pas : réessaie dans un instant.");
      },
    };
    const chat = createChatStore(async () => api as Api, vi.fn());
    chat.getState().setContext("Fractionné, ce soir 18:00", { screen: "today", sessionId: "s1" });
    await chat.getState().send("Plus court");
    expect(sent).toEqual([{ text: "Plus court", context: { screen: "today", sessionId: "s1" } }]);
    expect(chat.getState().messages.map((m) => m.text)).toEqual([
      expect.stringMatching(/^Salut/),
      "Plus court",
      "Je regarde.",
      "Reggie ne répond pas : réessaie dans un instant.",
    ]);
  });

  it("offers no Réessayer when Reggie is off on the server", async () => {
    const off: Pick<Api, "chat"> = {
      chat: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new ApiError(503, "Reggie ne répond pas pour l'instant.")),
        }),
      }),
    };
    const chat = createChatStore(async () => off as Api, vi.fn());
    await chat.getState().send("Salut");
    expect(chat.getState().messages.at(-1)).toMatchObject({
      text: "Reggie ne répond pas pour l'instant.",
      retry: undefined,
    });
  });

  it("loads the stored conversation once, under the welcome line", async () => {
    const chatHistory = vi
      .fn<Api["chatHistory"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ day: "2026-11-16", messages: [{ id: "m1", role: "user", text: "Bonjour" }] });
    const chat = createChatStore(async () => ({ chatHistory }) as unknown as Api, vi.fn());
    await chat.getState().loadHistory();
    expect(chat.getState().messages).toHaveLength(1);
    await chat.getState().loadHistory();
    await chat.getState().loadHistory();
    expect(chatHistory).toHaveBeenCalledTimes(2);
    expect(chat.getState().messages.map((m) => m.id)).toEqual(["welcome", "m1"]);
  });

  it("puts one earlier day at a time above the conversation, until there is none", async () => {
    const pages: Record<string, Awaited<ReturnType<Api["chatHistory"]>>> = {
      today: { day: "2026-11-16", earlier: "2026-11-15", messages: [{ id: "t1", role: "user", text: "Ce matin" }] },
      "2026-11-15": { day: "2026-11-15", earlier: "2026-11-12", messages: [{ id: "y1", role: "user", text: "Hier" }] },
      "2026-11-12": { day: "2026-11-12", messages: [{ id: "o1", role: "reggie", text: "Jeudi" }] },
    };
    const chatHistory = vi.fn<Api["chatHistory"]>(async (day) => pages[day ?? "today"] ?? Promise.reject());
    const chat = createChatStore(async () => ({ chatHistory }) as unknown as Api, vi.fn());
    await chat.getState().loadHistory();
    expect(chat.getState()).toMatchObject({ today: "2026-11-16", earlier: "2026-11-15" });
    await chat.getState().loadEarlier();
    await chat.getState().loadEarlier();
    expect(chat.getState().earlier).toBeUndefined();
    await chat.getState().loadEarlier();
    expect(chatHistory).toHaveBeenCalledTimes(3);
    expect(chat.getState().messages.map((m) => [m.id, m.day])).toEqual([
      ["o1", "2026-11-12"],
      ["y1", "2026-11-15"],
      ["welcome", undefined],
      ["t1", "2026-11-16"],
    ]);
  });
});

describe("plan store with the server's answers", () => {
  it("shows the server's message, and no Annuler when nothing changed", async () => {
    const notify = vi.fn();
    const api = createMockApi({ monday: MONDAY });
    const plan = createPlanStore(async () => api, notify);
    await plan.getState().apply(async () => ({ changeId: "", message: "Rien n'a changé", rows: [] }));
    expect(notify).toHaveBeenLastCalledWith("Rien n'a changé", undefined);
    await plan.getState().apply(() => Promise.reject(new ApiError(409, "Ce changement est déjà annulé.")));
    expect(notify).toHaveBeenLastCalledWith("Ce changement est déjà annulé.");
  });
});

describe("sheet store", () => {
  it("shows one sheet at a time and queues the next until the first has slid away", () => {
    vi.useFakeTimers();
    useSheet.getState().show({ kind: "move", id: RUN });
    expect(useSheet.getState()).toMatchObject({ open: true, current: { kind: "move" } });
    useSheet.getState().show({ kind: "change", id: RUN });
    expect(useSheet.getState()).toMatchObject({ open: false, queued: { kind: "change" } });
    vi.advanceTimersByTime(SHEET_CLOSE_MS);
    expect(useSheet.getState()).toMatchObject({ open: true, current: { kind: "change" } });
    useSheet.getState().close();
    vi.advanceTimersByTime(SHEET_CLOSE_MS);
    expect(useSheet.getState().current).toBeUndefined();
    vi.useRealTimers();
  });

  // Vaul never reports the end of a close it did not start: "Nouvelle séance de muscu" from + used to open nothing.
  it("opens a sheet asked for right after the app closed the previous one", () => {
    vi.useFakeTimers();
    useSheet.getState().show({ kind: "add" });
    useSheet.getState().close();
    useSheet.getState().show({ kind: "strength" });
    vi.advanceTimersByTime(SHEET_CLOSE_MS);
    expect(useSheet.getState()).toMatchObject({ open: true, current: { kind: "strength" } });
    useSheet.getState().close();
    vi.advanceTimersByTime(SHEET_CLOSE_MS);
    vi.useRealTimers();
  });
});
