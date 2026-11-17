import { useEffect, useRef, useState } from "react";
import { Typing } from "../../ui/bits.tsx";
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
  const [composer, setComposer] = useState(140);

  useEffect(() => {
    void useChat.getState().loadHistory();
  }, []);

  // Follow the conversation: the bottom of the newest message, widget or dots stays clear of the composer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls when the list, the status or the composer changes
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, status, composer]);

  return (
    <Screen className="gap-4!">
      <div className="flex items-center gap-3 pb-2">
        <span
          aria-hidden="true"
          className="flex size-12 flex-none items-center justify-center rounded-full bg-reggie text-on-color shadow-float"
        >
          <Icon name="reggie" />
        </span>
        <div className="flex flex-col">
          <h1 className="t-large">Reggie</h1>
          <span className="t-sub">Connaît ton plan, ta semaine et ta montre</span>
        </div>
      </div>
      {context && (
        <span className="ui-glass t-cap flex min-h-8 items-center gap-2 self-center rounded-full px-3.5 font-semibold text-ink">
          <span aria-hidden="true" className="size-2 rounded-full bg-reggie" />À propos de : {context}
        </span>
      )}
      <div role="log" aria-live="polite" aria-label="Conversation avec Reggie" className="flex flex-col gap-4">
        {messages.map((entry) => (
          <Message key={entry.id} entry={entry} today={today} />
        ))}
        {status === "thinking" && <Typing />}
        {status === "searching" && <Typing label="Reggie vérifie" text="Je vérifie" />}
      </div>
      {/* As tall as the floating composer and the tab bar under it: scrolled to, it lifts the last widget above them. */}
      <div
        ref={end}
        aria-hidden="true"
        className="flex-none"
        style={{ height: `calc(${composer + 12}px + var(--space-above-tabbar) + env(safe-area-inset-bottom))` }}
      />
      <Composer onHeight={setComposer} />
    </Screen>
  );
}
