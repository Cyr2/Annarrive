import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client.ts";
import { ApiError } from "../api/errors.ts";
import { createMockApi } from "../api/mock/index.ts";
import { createPlanStore } from "./plan/store.ts";
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
    expect(plan.getState().today?.session).toBeUndefined();
    expect(plan.getState().lastChangeId).toBe(result?.changeId);
    const [message, action] = notify.mock.lastCall ?? [];
    expect(message).toBe("Séance déplacée à jeudi 18:00");
    expect(action.label).toBe("Annuler");
    action.onClick();
    await vi.waitFor(() => expect(plan.getState().today?.session?.id).toBe(RUN));
    expect(plan.getState().lastChangeId).toBeUndefined();
    expect(notify).toHaveBeenLastCalledWith("Modification annulée");
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

  it("reports a load error", async () => {
    const plan = createPlanStore(() => Promise.reject(new Error("offline")), vi.fn());
    await plan.getState().load();
    expect(plan.getState().status).toBe("error");
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
    expect(chat.getState().messages.at(-1)?.text).toMatch(/^Je n'arrive pas/);
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

  it("loads the stored conversation once, under the welcome line", async () => {
    const chatHistory = vi
      .fn<Api["chatHistory"]>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue([{ id: "m1", role: "user", text: "Bonjour" }]);
    const chat = createChatStore(async () => ({ chatHistory }) as unknown as Api, vi.fn());
    await chat.getState().loadHistory();
    expect(chat.getState().messages).toHaveLength(1);
    await chat.getState().loadHistory();
    await chat.getState().loadHistory();
    expect(chatHistory).toHaveBeenCalledTimes(2);
    expect(chat.getState().messages.map((m) => m.id)).toEqual(["welcome", "m1"]);
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
