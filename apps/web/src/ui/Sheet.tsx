import type { ReactNode } from "react";
import { Drawer } from "vaul";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called once the closing animation is over, so the caller can unmount the content. */
  onClosed?: () => void;
  title: string;
  /** Right side of the header, "OK" in the strength sheet. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** "Annuler" for a sheet that edits, "Fermer" for one that only shows. */
  cancelLabel?: string;
  children: ReactNode;
};

/**
 * Bottom sheet (Vaul): rises without bounce, follows the finger when pulled down, and the screen behind
 * steps back and dims. The header mirrors the mockups: Annuler, centered title, optional action.
 */
export function Sheet({ open, onOpenChange, onClosed, title, action, cancelLabel = "Annuler", children }: Props) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      onAnimationEnd={(isOpen) => {
        if (!isOpen) onClosed?.();
      }}
      shouldScaleBackground
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-40 bg-scrim" />
        <Drawer.Content
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-env(safe-area-inset-top)-24px)] flex-col rounded-t-sheet bg-bg shadow-sheet outline-none"
        >
          <span aria-hidden="true" className="mt-2 h-1.25 w-9 self-center rounded-full bg-handle" />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 pt-3">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="t-body min-h-11 justify-self-start border-0 bg-transparent p-0 text-link"
            >
              {cancelLabel}
            </button>
            <Drawer.Title className="t-strong m-0 text-center">{title}</Drawer.Title>
            {action ? (
              <button
                type="button"
                onClick={action.onClick}
                disabled={action.disabled}
                className="t-strong min-h-11 justify-self-end border-0 bg-transparent p-0 text-link disabled:opacity-40"
              >
                {action.label}
              </button>
            ) : (
              <span />
            )}
          </div>
          <div className="flex flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-5 pb-[calc(env(safe-area-inset-bottom)+24px)]">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
