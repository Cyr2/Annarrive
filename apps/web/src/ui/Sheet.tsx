import {
  AnimatePresence,
  type DragControls,
  MotionConfig,
  type MotionValue,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "motion/react";
import {
  Component,
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { EXIT_SHEET, FADE_REDUCED, SPRING_SHEET } from "../lib/motion.ts";
import { lockScroll, revealDelta } from "../lib/overlay.ts";
import { Icon } from "./Icon.tsx";
import { handOffSheet, sheetOnScreen } from "./sheetHandoff.ts";
import { TextButton } from "./TextButton.tsx";
import { useVisibleArea } from "./useVisibleArea.ts";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Under the title: where she is in a flow ("Douleur · 2 sur 3"). */
  subtitle?: string;
  /** A step back inside the sheet: Retour replaces Annuler. */
  onBack?: () => void;
  /** Opened from another sheet: Retour goes back to it (a step back inside the sheet comes first). */
  previous?: () => void;
  /** Another sheet opened from this one is on screen: this one waits, hidden, with its state. */
  covered?: boolean;
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
  /** Where she is in a flow inside the sheet (0 first): a change slides the content forward or back. */
  step?: number;
  children: ReactNode;
};

/**
 * Bottom sheet: rises with a spring over a light ink scrim (the page stays still), follows the finger when pulled
 * down (by its top, or anywhere once its content is scrolled to the top), closes on Escape or a tap outside,
 * keeps focus inside (the app behind is inert) and gives it back on close. It sits above the keyboard when one
 * is up. One main action per sheet: in `footer`, or `action` for a long form.
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
/** A finger has to travel this far (px) before the content tells a pull from a tap. */
const SLOP = 8;

const FOCUSABLE =
  'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])';
/** What keeps its own drag: the handle (Motion takes it from the press), fields, sliders, switches. A switch's
    thumb slid a little downward used to start the sheet's pull too: both moved under the finger, in frost. */
const NO_PULL = "[data-sheet-handle], input, textarea, select, [role='slider'], [role='switch']";

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

/** How far up the sheet stands, from 0 (out of sight) to 1 (open). Motion writes a slide in % and a drag in px. */
function standing(y: number | string, panel: HTMLElement | null): number {
  const height = panel?.offsetHeight || window.innerHeight;
  const offset = typeof y === "number" ? y : (Number.parseFloat(y) || 0) * (y.endsWith("%") ? height / 100 : 1);
  return Math.min(1, Math.max(0, 1 - offset / height));
}

/**
 * A pull down from anywhere in the sheet drags it, as on iOS, when what is under the finger is scrolled to its
 * top: a scrolled list scrolls back first. Taps and sideways moves stay with the content.
 */
function usePullToClose(panel: RefObject<HTMLElement | null>, drag: DragControls, active: boolean) {
  useEffect(() => {
    const element = panel.current;
    if (!element || !active) return;
    let from: { x: number; y: number } | undefined;
    let pulling = false;
    const atTop = (target: EventTarget | null) => {
      for (let node = target instanceof Element ? target : null; node && node !== element; node = node.parentElement)
        if (node.scrollTop > 0) return false;
      return true;
    };
    const down = (event: PointerEvent) => {
      pulling = false;
      const target = event.target instanceof Element ? event.target : null;
      from =
        event.isPrimary && event.button === 0 && !target?.closest(NO_PULL)
          ? { x: event.clientX, y: event.clientY }
          : undefined;
    };
    const move = (event: PointerEvent) => {
      if (!from || pulling) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (Math.hypot(dx, dy) < SLOP) return;
      if (dy > Math.abs(dx) && atTop(event.target)) {
        pulling = true;
        drag.start(event);
      } else from = undefined;
    };
    // The browser must not take a pull for a scroll: once it scrolls, the finger's moves never reach the sheet.
    const touchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!touch || event.defaultPrevented) return;
      const downward = from && touch.clientY > from.y && touch.clientY - from.y >= Math.abs(touch.clientX - from.x);
      if (pulling || (downward && atTop(event.target))) event.preventDefault();
    };
    // A pull ends without a click on what it started on.
    const click = (event: MouseEvent) => {
      if (!pulling) return;
      event.preventDefault();
      event.stopPropagation();
      pulling = false;
    };
    element.addEventListener("pointerdown", down);
    element.addEventListener("pointermove", move);
    element.addEventListener("touchmove", touchMove, { passive: false });
    element.addEventListener("click", click, true);
    return () => {
      element.removeEventListener("pointerdown", down);
      element.removeEventListener("pointermove", move);
      element.removeEventListener("touchmove", touchMove);
      element.removeEventListener("click", click, true);
    };
  }, [panel, drag, active]);
}

/**
 * While the sheet slides or follows the finger nothing blurs, the page behind included (`data-moving`,
 * surfaces.css): under a moving sheet and scrim every blur is filtered again at every frame, more than a phone's
 * GPU draws in 16 ms. The glass comes back once the sheet stands still.
 */
function useFrostWhileMoving(panel: RefObject<HTMLElement | null>, y: MotionValue<number | string>, rising: boolean) {
  const dragging = useRef(false);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!element) return;
    const start = () => element.toggleAttribute("data-moving", true);
    // Motion still counts the animation as running when it reports its end: only the finger can keep it frost.
    const end = () => element.toggleAttribute("data-moving", dragging.current);
    // Before the first frame: a sheet that rises starts as frost.
    element.toggleAttribute("data-moving", rising);
    const off = [y.on("animationStart", start), y.on("animationComplete", end), y.on("animationCancel", end)];
    return () => {
      for (const unsubscribe of off) unsubscribe();
    };
  }, [panel, y, rising]);
  // A step inside the sheet is over: the glass comes back unless the sheet still moves.
  const settle = useCallback(
    () => panel.current?.toggleAttribute("data-moving", dragging.current || y.isAnimating()),
    [panel, y],
  );
  return {
    settle,
    onDragStart: () => {
      dragging.current = true;
      panel.current?.setAttribute("data-moving", "");
    },
    // The spring back (or the slide out) starts in the same frame: a frame later, it is running or there is none.
    onDragEnd: () => {
      dragging.current = false;
      requestAnimationFrame(() => panel.current?.toggleAttribute("data-moving", y.isAnimating()));
    },
  };
}

/**
 * While it is the sheet on screen, the page under it stays put (iOS scrolls it otherwise, from the scrim or a
 * list at its end), and a focused field stays in sight above the keyboard: when the keyboard comes, changes
 * height, or another field takes the focus, the content scrolls just enough.
 */
function useStillPage(panel: RefObject<HTMLElement | null>, area: unknown, active: boolean, still: boolean) {
  useEffect(() => {
    const element = panel.current;
    if (!element || !active) return;
    return lockScroll(element);
  }, [panel, active]);
  const reveal = useCallback(() => {
    const body = panel.current?.querySelector<HTMLElement>(":scope > [data-sheet-part='body']");
    const field = document.activeElement;
    if (!body || !(field instanceof HTMLElement) || !body.contains(field) || !field.matches("input, textarea, select"))
      return;
    // The whole row, its label with it.
    const box = (field.closest(".row, .ui-field") ?? field).getBoundingClientRect();
    const top = revealDelta(box, body.getBoundingClientRect());
    if (top) body.scrollBy({ top, behavior: still ? "instant" : "smooth" });
  }, [panel, still]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the visible area changing is what calls for it
  useLayoutEffect(reveal, [area, reveal]);
  useEffect(() => {
    const element = panel.current;
    if (!element || !active) return;
    // After iOS has placed the page for the field: the keyboard may already be up (from one field to the next).
    const focused = () => requestAnimationFrame(reveal);
    element.addEventListener("focusin", focused);
    return () => element.removeEventListener("focusin", focused);
  }, [panel, active, reveal]);
}

/** React's one moment before the page changes: the step on screen is copied before the next one replaces it. */
class StepWatch extends Component<{ step: number }> {
  override getSnapshotBeforeUpdate(previous: { step: number }) {
    if (previous.step !== this.props.step) handOffSheet(this.props.step > previous.step);
    return null;
  }
  override componentDidUpdate() {}
  override render() {
    return null;
  }
}

/** While it is the sheet on screen: the app behind is inert, focus is inside, Escape closes, focus goes back after. */
function useModal(panel: RefObject<HTMLElement | null>, close: RefObject<() => void>, covered: boolean) {
  useEffect(() => {
    if (covered) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById("root");
    // Once risen: making the whole app inert restyles every element of it, a frame lost on a phone if done as it
    // starts to rise. Until then the scrim takes the taps and focus is held inside (keepFocusIn).
    const inert = setTimeout(() => root?.setAttribute("inert", ""), SPRING_SHEET.duration * 1000);
    (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current)?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
      if (event.key === "Tab" && panel.current) keepFocusIn(panel.current, event);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(inert);
      root?.removeAttribute("inert");
      opener?.focus({ preventScroll: true });
    };
  }, [panel, close, covered]);
}

type HeaderProps = Pick<Props, "title" | "subtitle" | "action" | "busy"> & {
  titleId: string;
  /** Retour, a step back inside the sheet or to the sheet it was opened from: it takes Annuler's place. */
  back?: () => void;
  onCancel: () => void;
  cancelLabel: string;
};

function HeaderRow({ titleId, title, subtitle, back, onCancel, cancelLabel, action, busy }: HeaderProps) {
  return (
    // Annuler or Fermer never shrinks under a long title on a 320 px phone: the title wraps instead.
    <div
      data-sheet-part="head"
      className="grid grid-cols-[minmax(max-content,1fr)_minmax(0,auto)_minmax(max-content,1fr)] items-center gap-2 pt-2"
    >
      {back ? (
        // On a 320 px phone the chevron alone goes back, as in iOS, so a long title never runs into it.
        <TextButton className="-ml-1 min-w-11 justify-self-start gap-0.5" onClick={back}>
          <Icon name="chevronLeft" size={22} stroke={2.4} />
          <span className="max-[359px]:sr-only">Retour</span>
        </TextButton>
      ) : (
        <TextButton className="justify-self-start" onClick={onCancel}>
          {cancelLabel}
        </TextButton>
      )}
      <div className="flex max-w-[60vw] min-w-0 flex-col items-center text-center text-balance">
        <h2 id={titleId} className="t-strong m-0">
          {title}
        </h2>
        {subtitle && <span className="t-cap">{subtitle}</span>}
      </div>
      {action ? (
        <TextButton
          // The label is 33 px wide: the hit area reaches 44 px without moving it.
          className="relative justify-self-end font-semibold after:absolute after:inset-y-0 after:-inset-x-2 after:content-['']"
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
  );
}

function Panel({
  onOpenChange,
  title,
  subtitle,
  onBack,
  previous,
  covered = false,
  action,
  cancelLabel = "Annuler",
  footer,
  busy = false,
  appear = true,
  step = 0,
  children,
}: Omit<Props, "open">) {
  const titleId = useId();
  const drag = useDragControls();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(() => onOpenChange(false));
  close.current = () => onOpenChange(false);
  // Only a press that starts on the scrim closes: a tap whose content shrinks under the finger lands there too.
  const pressedScrim = useRef(false);
  const area = useVisibleArea();
  // Under reduced motion the sheet fades in and out (150 ms) instead of sliding, and the page stays still.
  const still = useReducedMotion() ?? false;
  const y = useMotionValue<number | string>(0);
  const progress = useTransform(y, (value) => standing(value, panel.current));
  const back = onBack ?? previous;
  usePullToClose(panel, drag, !still && !covered);
  useStillPage(panel, area, !covered, still);
  const frost = useFrostWhileMoving(panel, y, appear && !still);

  useModal(panel, close, covered);

  // On screen, the sheet plays in what took the place of the one before (sheetHandoff.ts).
  const rising = useRef(appear);
  const { settle } = frost;
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new step is what plays the handoff
  useLayoutEffect(() => {
    const element = panel.current;
    if (covered || !element) return;
    const leave = sheetOnScreen(element, rising.current, still, settle);
    rising.current = false;
    return leave;
  }, [covered, step, still, settle]);

  return (
    <div
      hidden={covered}
      className="fixed inset-x-0 top-0 bottom-0 z-40"
      style={area && { top: area.top, height: area.height, bottom: "auto" }}
    >
      {/* The scrim and the sheet keep their own layers (will-change) for as long as they are up. Otherwise, once the
          slide ends, Chrome on Android folds the sheet back into the page and skips painting it for a frame or two:
          the page flashed through it. */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-scrim will-change-[opacity]"
        style={still ? undefined : { opacity: progress }}
        initial={still && appear && { opacity: 0 }}
        animate={still ? { opacity: 1, transition: FADE_REDUCED } : undefined}
        exit={still ? { opacity: 0, transition: FADE_REDUCED } : undefined}
        onPointerDown={() => {
          pressedScrim.current = true;
        }}
        onClick={() => pressedScrim.current && close.current()}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        data-variant="sheet"
        className="surface contain-layout absolute inset-x-0 bottom-0 mx-auto flex will-change-transform max-h-[calc(100%-env(safe-area-inset-top)-16px)] w-full max-w-xl flex-col outline-none"
        aria-busy={busy}
        style={{ y }}
        initial={appear && (still ? { opacity: 0 } : { y: "105%" })}
        animate={still ? { opacity: 1, transition: FADE_REDUCED } : { y: 0, transition: SPRING_SHEET }}
        exit={still ? { opacity: 0, transition: FADE_REDUCED } : { y: "105%", transition: EXIT_SHEET }}
        drag="y"
        dragListener={false}
        dragControls={drag}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragTransition={{ bounceStiffness: 400, bounceDamping: 40 }}
        onPointerDownCapture={() => {
          pressedScrim.current = false;
        }}
        onDragStart={frost.onDragStart}
        onDragEnd={(_event, info) => {
          frost.onDragEnd();
          if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_SPEED) close.current();
        }}
      >
        <header
          data-sheet-handle=""
          className="flex-none touch-none px-4 pt-2"
          onPointerDown={(event) => drag.start(event)}
        >
          <span aria-hidden="true" className="mx-auto block h-1.25 w-9 rounded-full bg-hairline-strong" />
          <HeaderRow
            titleId={titleId}
            title={title}
            subtitle={subtitle}
            back={back}
            onCancel={() => close.current()}
            cancelLabel={cancelLabel}
            action={action}
            busy={busy}
          />
        </header>
        <StepWatch step={step} />
        <div data-sheet-part="body" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {/* Its own box, at the content's natural height: a push inside the sheet follows it (sheetHandoff.ts). */}
          <div
            data-sheet-content=""
            className="flex flex-col gap-5 px-4 pt-4 *:flex-none"
            style={{ paddingBottom: footer ? 16 : "max(24px, env(safe-area-inset-bottom))" }}
          >
            {children}
          </div>
        </div>
        {footer && (
          // A disabled fieldset holds every button of the footer while the change is on its way.
          <fieldset
            data-sheet-part="foot"
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
