import { useEffect, useRef, useState } from "react";
import { Chip, IconButton, Input } from "../../ui/controls.tsx";
import { frenchSpaces } from "./Message.tsx";
import { useChat } from "./store.ts";

/** The same journeys as the buttons of Aujourd'hui, one tap away. */
export const SHORTCUTS = ["Je suis malade", "Plus court", "Décaler à demain", "Pourquoi cette allure ?"];

/**
 * Shortcuts and the message field, floating just above the tab bar. It reports its height, so the
 * conversation always keeps its last widget clear of it.
 */
export function Composer({ onHeight, shortcuts }: { onHeight: (height: number) => void; shortcuts: boolean }) {
  const send = useChat((s) => s.send);
  const busy = useChat((s) => s.status !== "idle");
  const [text, setText] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const report = useRef(onHeight);
  report.current = onHeight;

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
  return (
    <div
      ref={box}
      className="ui-float fixed inset-x-0 z-20 mx-auto flex max-w-xl flex-col gap-2 px-gutter"
      style={{ bottom: "calc(var(--space-above-tabbar) + env(safe-area-inset-bottom))" }}
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
          onChange={setText}
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
    </div>
  );
}
