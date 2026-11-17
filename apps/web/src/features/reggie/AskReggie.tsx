import { useId, useState } from "react";
import { IconButton, Input } from "../../ui/controls.tsx";
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
      <label htmlFor={id} className="t-cap flex items-center gap-1.5 px-4">
        <span aria-hidden="true" className="size-2 rounded-full bg-reggie" />
        {label}
      </label>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          value={text}
          onChange={setText}
          placeholder={placeholder ?? "Par exemple : je cours avec une amie"}
          className="flex-1"
        />
        <IconButton
          type="submit"
          icon="send"
          label="Envoyer à Reggie"
          variant="tinted"
          tone="reggie"
          size="large"
          disabled={!text.trim()}
        />
      </div>
    </form>
  );
}
