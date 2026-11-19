import { CHAT_TEXT_MAX } from "@annarrive/protocol";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Chip, IconButton, Input } from "../../ui/controls.tsx";
import { notify } from "../../ui/toast.ts";
import { useVisibleArea } from "../../ui/useVisibleArea.ts";
import { frenchSpaces } from "./Message.tsx";
import { useChat } from "./store.ts";

/** The same journeys as the buttons of Aujourd'hui, one tap away. */
export const SHORTCUTS = ["Je suis malade", "Plus court", "Décaler à demain", "Pourquoi cette allure ?"];

const TOO_LONG = `Un message s'arrête à ${CHAT_TEXT_MAX} caractères. Envoie la suite dans un autre.`;

type Props = { onHeight: (height: number) => void; onTyping: (typing: boolean) => void; shortcuts: boolean };

/**
 * Shortcuts and the message field, floating just above the tab bar. While she types, the tab bar steps aside
 * and the field rides on the keyboard, as in Messages. It reports its height and whether she types, so the
 * conversation always keeps its last message clear of it.
 */
export function Composer({ onHeight, onTyping, shortcuts }: Props) {
  const send = useChat((s) => s.send);
  const busy = useChat((s) => s.status !== "idle");
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const box = useRef<HTMLElement>(null);
  // The keyboard covers the bottom of the page: the field sits on top of what is left visible.
  const area = useVisibleArea();
  const typing = focused && area !== undefined;
  const above = area && typing ? `${window.innerHeight - area.top - area.height + 8}px` : undefined;
  const report = useRef(onHeight);
  report.current = onHeight;
  const reportTyping = useRef(onTyping);
  reportTyping.current = onTyping;

  useEffect(() => {
    reportTyping.current(typing);
    if (!typing) return;
    // The tab bar hides while the keyboard is up (styles/app.css), as iOS and Android apps do.
    document.documentElement.dataset.typing = "";
    return () => {
      delete document.documentElement.dataset.typing;
    };
  }, [typing]);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const root = document.documentElement.style;
    // The toast reads it to float above the field instead of covering it.
    const observer = new ResizeObserver(() => {
      report.current(element.offsetHeight);
      root.setProperty("--composer-height", `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
      root.removeProperty("--composer-height");
    };
  }, []);

  const submit = (value: string) => {
    if (busy || !value.trim()) return;
    void send(value);
    setText("");
  };
  // Outside the screen's box: a screen sliding to the next tab (useTabSwipe) would carry it off its place.
  return createPortal(
    <section
      ref={box}
      aria-label="Écrire à Reggie"
      className="ui-float fixed inset-x-0 z-20 mx-auto flex max-w-xl flex-col gap-2 px-gutter"
      style={{ bottom: above ?? "calc(var(--space-above-tabbar) + env(safe-area-inset-bottom))" }}
    >
      {/* Hidden while Reggie answers or waits for her reply: his own buttons are the answers then. */}
      {shortcuts && (
        <div className="fade-x -mx-4 -my-2 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none]">
          {SHORTCUTS.map((label) => (
            <Chip key={label} onClick={() => submit(label)}>
              {frenchSpaces(label)}
            </Chip>
          ))}
        </div>
      )}
      <form
        onFocus={(e) => setFocused(e.target instanceof HTMLInputElement)}
        onBlur={() => setFocused(false)}
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <label htmlFor="msg" className="sr-only-label">
          Message pour Reggie
        </label>
        <Input
          id="msg"
          value={text}
          onChange={(value) => {
            // The field stops at the server's limit; a pasted text cut there says so, once.
            if (value.length >= CHAT_TEXT_MAX && text.length < CHAT_TEXT_MAX)
              void notify(TOO_LONG, undefined, undefined, "chat-max");
            setText(value);
          }}
          maxLength={CHAT_TEXT_MAX}
          placeholder="Écris à Reggie"
          action={
            <IconButton
              type="submit"
              icon="send"
              label="Envoyer"
              variant="filled"
              tone="reggie"
              disabled={busy || !text.trim()}
            />
          }
        />
      </form>
    </section>,
    document.getElementById("root") ?? document.body,
  );
}
