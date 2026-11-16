import { useId, useState } from "react";
import { IconButton } from "../../ui/Button.tsx";
import { useGo } from "../useGo.ts";
import { useChat } from "./store.ts";

type Props = { context: string; sessionId: string; label?: string; placeholder?: string; onSent: () => void };

/** "Dis-le à Reggie": a free text that opens the conversation, where Reggie answers with a proposal. */
export function AskReggie({ context, sessionId, onSent, label = "Autre chose ? Dis-le à Reggie", placeholder }: Props) {
  const id = useId();
  const go = useGo();
  const [text, setText] = useState("");
  const send = () => {
    if (!text.trim()) return;
    const chat = useChat.getState();
    chat.setContext(context, { screen: "today", sessionId });
    void chat.send(text);
    onSent();
    go("/reggie");
  };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={id} className="t-cap px-4">
        {label}
      </label>
      <div className="flex items-center gap-2 rounded-full bg-surface py-1.5 pr-1.5 pl-4">
        <input
          id={id}
          type="text"
          enterKeyHint="send"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={placeholder ?? "Par exemple : je cours avec une amie"}
          className="t-body min-h-10 min-w-0 flex-1 border-0 bg-transparent text-text"
        />
        <IconButton type="submit" icon="send" label="Envoyer à Reggie" tone="blueTint" size={18} />
      </div>
    </form>
  );
}
