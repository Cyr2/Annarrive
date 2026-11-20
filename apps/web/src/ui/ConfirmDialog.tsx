import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { lockScroll } from "../lib/overlay.ts";
import { Button } from "./controls.tsx";

type Action = { label: string; onClick: () => void };

type Props = {
  open: boolean;
  /** Annuler, Escape or a tap beside it: nothing happens. */
  onClose: () => void;
  /** The question: « Supprimer Jambes ? ». */
  title: string;
  /** What follows, in a sentence, when the title does not say it all. */
  message?: string;
  /** The destructive choices, one or a few (« Cette semaine seulement »). Each closes the alert as it acts. */
  actions: Action[];
};

/**
 * The one confirmation of a destructive action, as an iOS alert: a small glass card over the screen (and over a
 * sheet), its destructive buttons in red, Annuler under them and focused first. The button that asked for it
 * keeps its own meaning: it never turns into the confirmation. A native modal dialog: focus held inside, the
 * rest inert, Escape cancels, focus goes back after.
 */
export function ConfirmDialog({ open, onClose, title, message, actions }: Props) {
  const box = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const dialog = box.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    // React's autoFocus runs at mount, while the dialog is still closed.
    dialog.querySelector<HTMLElement>("[data-cancel]")?.focus();
    const unlock = lockScroll(dialog);
    return () => {
      unlock();
      dialog.close();
    };
  }, [open]);
  return createPortal(
    <dialog
      ref={box}
      aria-labelledby={`${id}-title`}
      aria-describedby={message ? `${id}-text` : undefined}
      data-variant="sheet"
      className="ui-alert surface m-auto w-[min(20rem,calc(100vw-32px))] rounded-card border-0 p-0 text-ink shadow-float"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // Its keys stay its own: a sheet under it would close on Escape and take Tab back.
      onKeyDown={(event) => event.stopPropagation()}
      // A tap on the backdrop lands on the dialog itself.
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="flex flex-col gap-1 px-5 pt-5 pb-4 text-center">
        <h2 id={`${id}-title`} className="t-strong m-0 text-balance">
          {title}
        </h2>
        {message && (
          <p id={`${id}-text`} className="t-sub m-0">
            {message}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2 px-4 pb-4">
        {actions.map((action) => (
          <Button
            key={action.label}
            variant="tinted"
            tone="danger"
            size="large"
            onClick={() => {
              onClose();
              action.onClick();
            }}
          >
            {action.label}
          </Button>
        ))}
        {/* Focused first (above): Enter on the keyboard never destroys. */}
        <Button size="large" data-cancel="" onClick={onClose}>
          Annuler
        </Button>
      </div>
    </dialog>,
    document.body,
  );
}
