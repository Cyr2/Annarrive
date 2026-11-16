import { useState } from "react";
import { IconButton } from "../../ui/Button.tsx";
import { Chip } from "../../ui/bits.tsx";
import { Glass } from "../../ui/Glass.tsx";
import { useChat } from "./store.ts";

/** The same journeys as the buttons of Aujourd'hui, one tap away. */
export const SHORTCUTS = ["Je suis malade", "Plus court", "Décaler à demain", "Pourquoi cette allure ?"];

/** Shortcuts and the message field, floating just above the tab bar. */
export function Composer() {
  const send = useChat((s) => s.send);
  const busy = useChat((s) => s.status !== "idle");
  const [text, setText] = useState("");
  const submit = (value: string) => {
    if (busy || !value.trim()) return;
    void send(value);
    setText("");
  };
  return (
    <div
      className="fixed inset-x-0 z-20 mx-auto flex max-w-xl flex-col gap-2 px-4"
      style={{ bottom: "calc(var(--space-above-tabbar) + env(safe-area-inset-bottom))" }}
    >
      <div className="-mx-4 -my-2 flex gap-2 overflow-x-auto overscroll-x-contain px-4 py-2 [scrollbar-width:none]">
        {SHORTCUTS.map((label) => (
          <Chip key={label} disabled={busy} onClick={() => submit(label)}>
            {label}
          </Chip>
        ))}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <Glass bar className="flex items-center gap-2 rounded-card py-1.5 pr-1.5 pl-4">
          <label htmlFor="msg" className="sr-only-label">
            Message pour Reggie
          </label>
          <input
            id="msg"
            type="text"
            enterKeyHint="send"
            autoComplete="off"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Écris à Reggie"
            className="t-body min-h-11 min-w-0 flex-1 border-0 bg-transparent text-text"
          />
          <IconButton type="submit" icon="send" label="Envoyer" tone="blue" disabled={busy || !text.trim()} />
        </Glass>
      </form>
    </div>
  );
}
