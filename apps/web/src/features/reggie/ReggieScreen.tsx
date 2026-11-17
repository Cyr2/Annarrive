import { useEffect, useRef, useState } from "react";
import { Typing } from "../../ui/bits.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { ReggieAvatar } from "../today/parts.tsx";
import { Composer } from "./Composer.tsx";
import { Message } from "./Message.tsx";
import { type Entry, useChat } from "./store.ts";

const ABOUT_SESSION = "Je regarde ta séance. Tu veux la déplacer, la raccourcir, ou comprendre son allure ?";

/** A question Reggie asked with buttons, a slider or slots, still waiting for her answer. */
function waiting(messages: Entry[]): boolean {
  const last = messages.at(-1);
  return Boolean(last?.widget && last.widget.type !== "change" && last.answer === undefined);
}

/** Reggie: one conversation, opened with the context of the screen. */
export default function ReggieScreen() {
  const { messages, status, context, about } = useChat();
  const today = usePlan(todayOf);
  const log = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [composer, setComposer] = useState(140);

  useEffect(() => {
    void useChat.getState().loadHistory();
  }, []);

  // Follow the conversation as it grows (a message, a widget whose controls load late, the dots), so the bottom
  // of the newest thing always clears the composer.
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const follow = () => end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    const observer = new ResizeObserver(follow);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the composer's height moves the end too
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [composer]);

  const welcome = about?.screen === "today" && about.sessionId ? ABOUT_SESSION : undefined;
  return (
    <Screen className="gap-4!">
      <div className="flex items-center gap-3 pb-1">
        <ReggieAvatar size="md" />
        <div className="flex flex-col">
          <h1 className="t-large">Reggie</h1>
          <span className="t-cap">Il connaît ton plan et ta montre.</span>
        </div>
      </div>
      {context && (
        <span className="ui-glass t-cap flex min-h-8 max-w-full items-center gap-2 self-center rounded-full px-3.5 font-semibold text-ink">
          <span aria-hidden="true" className="size-2 flex-none rounded-full bg-reggie" />
          <span className="truncate">À propos de : {context}</span>
        </span>
      )}
      <div
        ref={log}
        role="log"
        aria-live="polite"
        aria-label="Conversation avec Reggie"
        className="flex flex-col gap-3"
      >
        {messages.map((entry) => (
          <Message
            key={entry.id}
            entry={entry.id === "welcome" && welcome ? { ...entry, text: welcome } : entry}
            today={today}
          />
        ))}
        {status === "thinking" && <Typing />}
        {status === "searching" && <Typing label="Reggie vérifie ses sources" text="Je vérifie" />}
      </div>
      {/* As tall as the floating composer and the tab bar under it: scrolled to, it lifts the last widget above them. */}
      <div
        ref={end}
        aria-hidden="true"
        className="flex-none"
        style={{ height: `calc(${composer + 12}px + var(--space-above-tabbar) + env(safe-area-inset-bottom))` }}
      />
      <Composer onHeight={setComposer} shortcuts={status === "idle" && !waiting(messages)} />
    </Screen>
  );
}
