import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { daysBetween, longDate } from "../../lib/date.ts";
import { reducedMotion } from "../../lib/motion.ts";
import { Typing } from "../../ui/bits.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { useTabRoot } from "../tabRoot.ts";
import { Composer } from "./Composer.tsx";
import { Message } from "./Message.tsx";
import { type Entry, useChat } from "./store.ts";

const ABOUT_SESSION = "Je regarde ta séance. Tu veux la déplacer, la raccourcir ou comprendre son allure ?";
/** Closer to the bottom than this, she is following the conversation: new messages scroll into view. */
const FOLLOW_PX = 120;

/** A question Reggie asked with buttons, a slider or slots, still waiting for her answer. */
function waiting(messages: Entry[]): boolean {
  const last = messages.at(-1);
  return Boolean(last?.widget && last.widget.type !== "change" && last.answer === undefined);
}

/** "Aujourd'hui", "Hier", "Dimanche 15 novembre". */
export function dayLabel(day: string, today: string): string {
  const gap = daysBetween(day, today);
  if (gap === 0) return "Aujourd'hui";
  if (gap === 1) return "Hier";
  const date = longDate(day);
  return date.charAt(0).toUpperCase() + date.slice(1);
}

/** « Voir la discussion d'hier », « Voir la discussion du 15 novembre ». */
export function earlierLabel(day: string, today: string): string {
  if (daysBetween(day, today) === 1) return "Voir la discussion d'hier";
  return `Voir la discussion du ${longDate(day).replace(/^\S+ /, "")}`;
}

const fromBottom = () => document.documentElement.scrollHeight - window.scrollY - window.innerHeight;

/** Reggie: today's conversation, opened with the context of the screen; earlier days on demand, one at a time. */
export default function ReggieScreen() {
  const { messages, status, context, about, today: day, earlier, loadingEarlier } = useChat();
  const today = usePlan(todayOf);
  const log = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const [composer, setComposer] = useState(140);
  const [typing, setTyping] = useState(false);
  const following = useRef(true);
  /** Set while an earlier day loads: its distance to the bottom, kept when the day lands above. */
  const kept = useRef<number>(undefined);

  useEffect(() => {
    void useChat.getState().loadHistory();
  }, []);

  useEffect(() => {
    const onScroll = () => {
      following.current = fromBottom() < FOLLOW_PX;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Follow the conversation as it grows (a message, a widget whose controls load late, the dots), so the bottom
  // of the newest thing always clears the composer; not while she reads an earlier day.
  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const follow = () => following.current && end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
    const observer = new ResizeObserver(follow);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // A new message, the composer's height or the keyboard moves the end: back to the last message.
  const last = messages.at(-1)?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: each of these moves the end
  useEffect(() => {
    following.current = true;
    end.current?.scrollIntoView({ block: "end" });
  }, [last, composer, typing]);
  // An earlier day lands above: what she was reading stays where it was.
  const first = messages[0]?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the first message changes
  useLayoutEffect(() => {
    if (kept.current === undefined) return;
    window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight - kept.current);
    kept.current = undefined;
  }, [first]);

  // Its tab touched again: back to the last message, where the conversation opens, not to the oldest one.
  useTabRoot((event) => {
    event.preventDefault();
    following.current = true;
    end.current?.scrollIntoView({ block: "end", behavior: reducedMotion() ? "instant" : "smooth" });
  });

  const showEarlier = () => {
    kept.current = fromBottom();
    following.current = false;
    void useChat.getState().loadEarlier();
  };

  const welcome = about?.screen === "today" && about.sessionId ? ABOUT_SESSION : undefined;
  // Day headings only once an earlier day is on screen: alone, today needs none.
  const days = day !== undefined && messages.some((m) => m.day !== undefined && m.day !== day);
  let shownDay: string | undefined;
  return (
    <Screen className="gap-4! pb-0!">
      <h1 className="sr-only-label">Reggie</h1>
      {earlier && day && (
        <TextButton className="t-sub self-center" disabled={loadingEarlier} onClick={showEarlier}>
          {earlierLabel(earlier, day)}
        </TextButton>
      )}
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
        {messages.map((entry) => {
          const on = entry.day ?? day;
          const heading = days && on !== undefined && on !== shownDay;
          shownDay = on;
          return (
            <Fragment key={entry.id}>
              {heading && day && (
                <h2 className="ui-glass t-cap m-0 mt-2 self-center rounded-full px-3 py-1 font-semibold text-ink-2">
                  {dayLabel(on, day)}
                </h2>
              )}
              <Message entry={entry.id === "welcome" && welcome ? { ...entry, text: welcome } : entry} today={today} />
            </Fragment>
          );
        })}
        {status === "thinking" && <Typing />}
        {status === "searching" && <Typing label="Reggie vérifie ses sources" text="Je vérifie" />}
      </div>
      {/* As tall as the floating composer and what is under it (the tab bar, or the keyboard while she types):
          scrolled to, it lifts the last message above the suggestions and the field. The screen adds no padding under
          it (pb-0), so the space below the last message is the gap and this, nothing more. */}
      <div
        ref={end}
        aria-hidden="true"
        className="flex-none"
        style={{
          height: typing
            ? `${composer + 8}px`
            : `calc(${composer}px + var(--space-above-tabbar) + env(safe-area-inset-bottom))`,
        }}
      />
      <Composer onHeight={setComposer} onTyping={setTyping} shortcuts={status === "idle" && !waiting(messages)} />
    </Screen>
  );
}
