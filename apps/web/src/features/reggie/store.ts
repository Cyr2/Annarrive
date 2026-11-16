import { create } from "zustand";
import type { Api } from "../../api/client.ts";
import { api as defaultApi } from "../../api/index.ts";
import type { ChatEvent, ChatMessage } from "../../api/schemas.ts";
import { usePlan } from "../plan/store.ts";

/** A message as shown: widgets remember the answer picked, which fills that button and fades the others. */
export type Entry = ChatMessage & { answer?: string };

export type ChatState = {
  messages: Entry[];
  status: "idle" | "thinking" | "searching";
  /** What the conversation is about, "Fractionné, ce soir 18:00". Sent with every message. */
  context?: string;
  setContext: (context: string | undefined) => void;
  send: (text: string) => Promise<void>;
  /** Answers a widget: records the choice on it, then sends it as a message. */
  answer: (messageId: string, answer: string) => Promise<void>;
  /** Marks a change card as undone. */
  undone: (messageId: string) => void;
};

const WELCOME: Entry = {
  id: "welcome",
  role: "reggie",
  text: "Salut. Pose-moi une question sur ton plan, ou dis-moi ce qui change aujourd'hui.",
};

export function createChatStore(getApi: () => Promise<Api>, onChange: (changeId: string) => Promise<void>) {
  let seq = 0;
  return create<ChatState>((set, get) => {
    const receive = async (event: ChatEvent) => {
      if (event.type === "status") {
        set({ status: event.status });
        return;
      }
      set((s) => ({ messages: [...s.messages, event.message] }));
      const widget = event.message.widget;
      if (widget?.type === "change") await onChange(widget.change.changeId);
    };
    const failed = (): Entry => ({
      id: `e${++seq}`,
      role: "reggie",
      text: "Je n'arrive pas à répondre pour l'instant. Réessaie dans un moment.",
    });

    return {
      messages: [WELCOME],
      status: "idle",
      setContext: (context) => set({ context }),
      async send(text) {
        const trimmed = text.trim();
        if (!trimmed || get().status !== "idle") return;
        const mine: Entry = { id: `u${++seq}`, role: "user", text: trimmed };
        set((s) => ({ messages: [...s.messages, mine], status: "thinking" }));
        try {
          const client = await getApi();
          for await (const event of client.chat({ text: trimmed, context: get().context })) await receive(event);
        } catch {
          set((s) => ({ messages: [...s.messages, failed()] }));
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
    };
  });
}

export const useChat = createChatStore(defaultApi, (changeId) => usePlan.getState().sync(changeId));
