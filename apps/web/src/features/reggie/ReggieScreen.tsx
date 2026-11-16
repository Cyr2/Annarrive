import { useEffect, useRef } from "react";
import { Typing } from "../../ui/bits.tsx";
import { Glass } from "../../ui/Glass.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { Composer } from "./Composer.tsx";
import { Message } from "./Message.tsx";
import { useChat } from "./store.ts";

/** Reggie (design/Assistant, ReggieWidgets): one conversation, opened with the context of the screen. */
export default function ReggieScreen() {
  const { messages, status, context } = useChat();
  const today = usePlan(todayOf);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void useChat.getState().loadHistory();
  }, []);

  // Follow the conversation: the newest message, widget or typing dots stays in view.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the list or the status changes
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, status]);

  return (
    <Screen mood="reggie" className="gap-4!">
      <div className="flex items-center gap-3 pb-2">
        <span
          aria-hidden="true"
          className="flex size-12 flex-none items-center justify-center rounded-full bg-assistant text-on-accent shadow-accent"
        >
          <Icon name="reggie" />
        </span>
        <div className="flex flex-col">
          <h1 className="t-large">Reggie</h1>
          <span className="t-sub">Connaît ton plan, ta semaine et ta montre</span>
        </div>
      </div>
      {context && (
        <Glass className="t-cap flex min-h-8 items-center gap-2 self-center rounded-full px-3.5 font-semibold text-text">
          <span aria-hidden="true" className="size-2 rounded-full bg-intense" />À propos de : {context}
        </Glass>
      )}
      <div role="log" aria-live="polite" aria-label="Conversation avec Reggie" className="flex flex-col gap-4">
        {messages.map((entry) => (
          <Message key={entry.id} entry={entry} today={today} />
        ))}
        {status === "thinking" && <Typing />}
        {status === "searching" && (
          <Glass className="msg bubble-reggie t-body flex items-center gap-2 self-start px-4 py-3">
            <span className="typing-dot" aria-hidden="true" />
            Je vérifie
          </Glass>
        )}
      </div>
      <div ref={end} className="h-36 flex-none" />
      <Composer />
    </Screen>
  );
}
