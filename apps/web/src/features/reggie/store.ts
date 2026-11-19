import type { ChatContext } from "@annarrive/protocol";
import { create } from "zustand";
import type { Api } from "../../api/client.ts";
import { ApiError } from "../../api/errors.ts";
import { api as defaultApi } from "../../api/index.ts";
import type { ChatEvent, ChatMessage } from "../../api/schemas.ts";
import { notify } from "../../ui/toast.ts";
import { usePlan } from "../plan/store.ts";

/** A message as shown: widgets remember the answer picked, which fills that button and fades the others. */
export type Entry = ChatMessage & {
  answer?: string;
  /** The day of a stored message ("2026-11-16"); absent on what was said since the screen opened (today). */
  day?: string;
  /** On a failed reply: the message to send again, and the bubble it came from (replaced by the retry). */
  retry?: { text: string; from: string };
};

export type ChatState = {
  messages: Entry[];
  status: "idle" | "thinking" | "searching" | "writing";
  /** What the conversation is about, "Fractionné, ce soir 18:00", shown above it. */
  context?: string;
  /** The same, for Reggie: the screen and the session. Sent with every message. */
  about?: ChatContext;
  historyLoaded: boolean;
  /** Today as the server counts it, once the history is read. */
  today?: string;
  /** The latest earlier day with messages: « Voir la discussion d'hier » loads it. */
  earlier?: string;
  loadingEarlier: boolean;
  setContext: (context: string | undefined, about?: ChatContext) => void;
  /** Reads today's stored conversation once, under the welcome line. */
  loadHistory: () => Promise<void>;
  /** Puts the day before the oldest one shown above it, one day per call. */
  loadEarlier: () => Promise<void>;
  send: (text: string) => Promise<void>;
  /** Answers a widget: records the choice on it, then sends it as a message. */
  answer: (messageId: string, answer: string) => Promise<void>;
  /** Marks a change card as undone. */
  undone: (messageId: string) => void;
  /** Sends again the message a failed reply answered, in place of both. */
  retry: (messageId: string) => Promise<void>;
};

const WELCOME: Entry = {
  id: "welcome",
  role: "reggie",
  text: "Salut. Pose-moi une question sur ton plan, ou dis-moi ce qui change aujourd'hui.",
};
const CANNOT_ANSWER = "Je n'arrive pas à répondre pour l'instant. Réessaie dans un moment.";

/** A message whose id is already on screen replaces it: that is how the streamed text grows. */
function upsert(messages: Entry[], message: ChatMessage): Entry[] {
  const at = messages.findIndex((m) => m.id === message.id);
  return at === -1 ? [...messages, message] : messages.map((m, i) => (i === at ? message : m));
}

export function createChatStore(getApi: () => Promise<Api>, onChange: (changeId: string) => Promise<void>) {
  let seq = 0;
  return create<ChatState>((set, get) => {
    const receive = async (event: ChatEvent) => {
      if (event.type === "status") {
        set({ status: event.status });
        return;
      }
      // His first words replace the typing dots; the reply is still coming, so the chat stays busy.
      const writing = event.message.role === "reggie" && event.message.text !== "";
      set((s) => ({ messages: upsert(s.messages, event.message), status: writing ? "writing" : s.status }));
      const widget = event.message.widget;
      if (widget?.type === "change") await onChange(widget.change.changeId);
    };
    const failed = (error: unknown, mine: Entry): Entry => ({
      id: `e${++seq}`,
      role: "reggie",
      text: error instanceof ApiError && error.status !== 0 ? error.message : CANNOT_ANSWER,
      // 503: Reggie is off on this server; sending the same words again would fail the same way.
      retry: error instanceof ApiError && error.status === 503 ? undefined : { text: mine.text, from: mine.id },
    });

    return {
      messages: [WELCOME],
      status: "idle",
      historyLoaded: false,
      loadingEarlier: false,
      setContext: (context, about) => set({ context, about }),
      async loadHistory() {
        if (get().historyLoaded) return;
        set({ historyLoaded: true });
        try {
          const page = await (await getApi()).chatHistory();
          const history = page.messages.map((m) => ({ ...m, day: page.day }));
          set((s) => ({
            today: page.day,
            earlier: page.earlier,
            messages: [WELCOME, ...history, ...s.messages.filter((m) => m.id !== WELCOME.id)],
          }));
        } catch {
          // The conversation still works without its past: a later visit tries again.
          set({ historyLoaded: false });
        }
      },
      async loadEarlier() {
        const day = get().earlier;
        if (!day || get().loadingEarlier) return;
        set({ loadingEarlier: true });
        try {
          const page = await (await getApi()).chatHistory(day);
          const older = page.messages.map((m) => ({ ...m, day: page.day }));
          set((s) => ({ earlier: page.earlier, messages: [...older, ...s.messages] }));
        } catch {
          void notify("Cette discussion n'a pas pu s'afficher. Réessaie dans un instant.");
        } finally {
          set({ loadingEarlier: false });
        }
      },
      async send(text) {
        const trimmed = text.trim();
        if (!trimmed || get().status !== "idle") return;
        const mine: Entry = { id: `u${++seq}`, role: "user", text: trimmed };
        set((s) => ({ messages: [...s.messages, mine], status: "thinking" }));
        try {
          const client = await getApi();
          for await (const event of client.chat({ text: trimmed, context: get().about })) await receive(event);
        } catch (error) {
          set((s) => ({ messages: [...s.messages, failed(error, mine)] }));
        } finally {
          set({ status: "idle" });
        }
      },
      async answer(messageId, answer) {
        set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, answer } : m)) }));
        await get().send(answer);
      },
      undone(messageId) {
        set((s) => ({ messages: s.messages.map((m) => (m.id === messageId ? { ...m, answer: "undone" } : m)) }));
      },
      async retry(messageId) {
        const retry = get().messages.find((m) => m.id === messageId)?.retry;
        if (!retry || get().status !== "idle") return;
        set((s) => ({ messages: s.messages.filter((m) => m.id !== messageId && m.id !== retry.from) }));
        await get().send(retry.text);
      },
    };
  });
}

export const useChat = createChatStore(defaultApi, (changeId) => usePlan.getState().sync(changeId));
