import { useId, useState } from "react";
import { incident } from "../../api/journal.ts";
import { IconButton, Input } from "../../ui/controls.tsx";
import { notify } from "../../ui/toast.ts";

/**
 * « Signaler un souci » (interactions.md, Programme): her last gestures leave for the incident journal, with the
 * sentence she chose to write, if any.
 */
export function ReportIssue() {
  const id = useId();
  const [text, setText] = useState("");
  const send = () => {
    incident("report", text.trim().slice(0, 500) || "Signalement sans texte");
    setText("");
    void notify(navigator.onLine ? "Merci, c'est envoyé." : "Merci. Il partira dès que tu auras du réseau.");
  };
  return (
    <form
      className="mt-2 flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label htmlFor={id} className="t-cap px-4">
        Signaler un souci
      </label>
      <Input
        id={id}
        value={text}
        onChange={setText}
        placeholder="Ce qui s'est passé, si tu veux"
        action={<IconButton type="submit" icon="send" label="Envoyer le signalement" variant="filled" />}
      />
      <p className="t-cap m-0 px-4">Tes derniers gestes dans l'app partent avec, pour qu'on trouve ce qui a coincé.</p>
    </form>
  );
}
