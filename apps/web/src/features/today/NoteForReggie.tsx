import { useState } from "react";
import { IconButton } from "../../ui/controls.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useChat } from "../reggie/store.ts";
import { useGo } from "../useGo.ts";
import { ReggieAvatar } from "./parts.tsx";

/** "Un mot pour Reggie": a free note after the run, sent into the conversation, where he answers. */
export function NoteForReggie({ context }: { context: string }) {
  const [note, setNote] = useState("");
  const go = useGo();
  const send = () => {
    if (!note.trim()) return;
    const chat = useChat.getState();
    chat.setContext(context, { screen: "after_run" });
    void chat.send(note);
    setNote("");
    go("/reggie");
  };
  return (
    <Surface variant="widget" className="flex flex-col gap-1 py-3 pr-3 pl-4">
      <label htmlFor="note" className="t-strong flex items-center gap-2.5">
        <ReggieAvatar />
        Un mot pour Reggie
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="note"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex. : mollet un peu raide sur la fin"
          className="t-body min-w-0 flex-1 resize-none border-0 bg-transparent px-1 py-2 text-ink placeholder:text-ink-3"
        />
        <IconButton
          icon="send"
          label="Envoyer à Reggie"
          variant="filled"
          tone="reggie"
          disabled={!note.trim()}
          onClick={send}
        />
      </div>
    </Surface>
  );
}
