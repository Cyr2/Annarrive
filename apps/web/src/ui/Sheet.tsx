import { AnimatePresence, MotionConfig, motion, useDragControls, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { EXIT_SHEET, FADE, FADE_REDUCED, SPRING_SHEET } from "../lib/motion.ts";
import { Icon } from "./Icon.tsx";
import { TextButton } from "./TextButton.tsx";
import { useVisibleArea } from "./useVisibleArea.ts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Under the title: where she is in a flow ("Douleur · 2 sur 3"). */
  subtitle?: string;
  /** A step back inside the sheet: a chevron replaces Annuler. */
  onBack?: () => void;
  /** Header right, for long forms only ("OK"): such a sheet has no footer button. */
  action?: { label: string; onClick: () => void; disabled?: boolean };
  /** "Annuler" for a sheet that edits, "Fermer" for one that only shows. */
  cancelLabel?: string;
  /** The one main action, pinned under the body so it never scrolls out of reach. */
  footer?: ReactNode;
  /** A change is on its way: the main action waits (and says so), a second tap sends nothing. */
  busy?: boolean;
  /** False when the sheet takes the place of another one already up: it does not rise again. */
  appear?: boolean;
  children: ReactNode;
};

/**
 * Bottom sheet: rises with a spring over an ink scrim, follows the finger when pulled down by its top, closes
 * on Escape or a tap outside, keeps focus inside (the app behind is inert) and gives it back on close. It sits
 * above the keyboard when one is up. One main action per sheet: in `footer`, or `action` for a long form.
 */
export function Sheet({ open, ...props }: Props) {
  return createPortal(
    <MotionConfig reducedMotion="user">
      <AnimatePresence>{open && <Panel {...props} />}</AnimatePresence>
    </MotionConfig>,
    document.body,
  );
}

/** Pulled down this far (px), or flicked this fast (px/s), a sheet closes. */
const DISMISS_DISTANCE = 120;
const DISMISS_SPEED = 600;

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';

/** Tab from the last control comes back to the first one (and Shift+Tab the other way): focus never leaves. */
function keepFocusIn(panel: HTMLElement, event: KeyboardEvent) {
  const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const first = items[0];
  const last = items.at(-1);
  const at = document.activeElement;
  const wrapTo = event.shiftKey ? (at === first || at === panel ? last : undefined) : at === last ? first : undefined;
  if (!wrapTo) return;
  event.preventDefault();
  wrapTo.focus();
}

function Panel({
  onOpenChange,
  title,
  subtitle,
  onBack,
  action,
  cancelLabel = "Annuler",
  footer,
  busy = false,
  appear = true,
  children,
}: Omit<Props, "open">) {
  const titleId = useId();
  const drag = useDragControls();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(() => onOpenChange(false));
  close.current = () => onOpenChange(false);
  const area = useVisibleArea();
  // Under reduced motion the sheet fades in and out (150 ms) instead of sliding.
  const still = useReducedMotion() ?? false;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab" && panel.current) keepFocusIn(panel.current, event);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      root?.removeAttribute("inert");
      opener?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      className="fixed inset-x-0 top-0 bottom-0 z-40"
      style={area && { top: area.top, height: area.height, bottom: "auto" }}
    >
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-scrim"
        initial={appear && { opacity: 0 }}
        animate={{ opacity: 1, transition: still ? FADE_REDUCED : FADE }}
        exit={{ opacity: 0, transition: still ? FADE_REDUCED : EXIT_SHEET }}
        onClick={() => close.current()}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-variant="sheet"
        className="surface absolute inset-x-0 bottom-0 mx-auto flex max-h-[calc(100%-env(safe-area-inset-top)-16px)] w-full max-w-xl flex-col outline-none"
        aria-busy={busy}
        initial={appear && (still ? { opacity: 0 } : { y: "105%" })}
        animate={still ? { opacity: 1, transition: FADE_REDUCED } : { y: 0, transition: SPRING_SHEET }}
        exit={still ? { opacity: 0, transition: FADE_REDUCED } : { y: "105%", transition: EXIT_SHEET }}
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        onDragEnd={(_event, info) => {
          if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_SPEED) close.current();
        }}
      >
        <header className="flex-none touch-none px-4 pt-2" onPointerDown={(event) => drag.start(event)}>
          <span aria-hidden="true" className="mx-auto block h-1.25 w-9 rounded-full bg-hairline-strong" />
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-2">
            {onBack ? (
              <TextButton className="justify-self-start" aria-label="Retour" onClick={onBack}>
                <Icon name="chevronLeft" size={22} stroke={2.4} />
              </TextButton>
            ) : (
              <TextButton className="justify-self-start" onClick={() => close.current()}>
                {cancelLabel}
              </TextButton>
            )}
            <div className="flex min-w-0 flex-col items-center text-center">
              <h2 id={titleId} className="t-strong m-0">
                {title}
              </h2>
              {subtitle && <span className="t-cap">{subtitle}</span>}
            </div>
            {action ? (
              <TextButton
                className="justify-self-end font-semibold"
                onClick={action.onClick}
                disabled={action.disabled || busy}
                aria-busy={busy}
              >
                {action.label}
              </TextButton>
            ) : (
              <span />
            )}
          </div>
        </header>
        <div
          className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 pt-4 *:flex-none"
          style={{ paddingBottom: footer ? 16 : "max(24px, env(safe-area-inset-bottom))" }}
        >
          {children}
        </div>
        {footer && (
          // A disabled fieldset holds every button of the footer while the change is on its way.
          <fieldset
            disabled={busy}
            className="sheet-footer m-0 flex min-w-0 flex-none flex-col gap-2 border-t-[0.5px] border-hairline px-4 pt-3"
            style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
          >
            {footer}
          </fieldset>
        )}
      </motion.div>
    </div>
  );
}
