import { useEffect, useRef } from "react";
import { TAB_ENTER as ENTER, TAB_LEAVE as LEAVE, reducedMotion } from "../lib/motion.ts";
import { gestureOf, keepsSideways, turnOf } from "../lib/swipe.ts";

/** The tabs in the tab bar's order: a swipe to the left goes to the next one. */
const ORDER = ["/", "/semaine", "/programme", "/reggie"];

/**
 * Where a sideways swipe leads from a tab: the tab beside it, or nowhere at either end. Semaine keeps its swipe for
 * the weeks; an edge swipe there would fight Android's back gesture, which takes both edges of the screen.
 */
export function swipeTarget(location: string, step: -1 | 1): string | undefined {
  const index = ORDER.indexOf(location);
  if (index < 0 || location === "/semaine") return undefined;
  return ORDER[index + step];
}

/** A swipe leads somewhere from this screen. */
export const swipes = (location: string) => Boolean(swipeTarget(location, 1) ?? swipeTarget(location, -1));

/**
 * The screen follows a quarter of the finger toward a tab, a tenth past the last one (rubber band). Not 1:1: each
 * screen is a whole page on the window's scroll, with its own requests and floating parts (Reggie's field), so
 * the next one cannot be drawn beside it; it comes in from that side once the finger lets go.
 */
const FOLLOW = 0.25;
const RESIST = 0.1;
/** How much the screen fades at the end of its follow. */
const DIM = 0.35;
/** The screen a swipe opened comes in from this side (1: from the right). */
let entering: -1 | 0 | 1 = 0;

/**
 * Swipe sideways to the tab beside: the screen leans toward the finger and dims, and past a quarter of the
 * width (or flicked) it slips out and the next one slides in from the side the finger came from; short of it,
 * it eases back.
 * Touch only (a mouse drag selects text). A vertical move stays a scroll, a long press stays a press, a row that
 * scrolls sideways and a field keep their own moves; a sheet sits outside the screen and never starts one. Reduced
 * motion: the tab changes at once, nothing slides. `ref` goes on the screen's box, which moves.
 */
export function useTabSwipe(location: string, navigate: (href: string) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const go = useRef(navigate);
  go.current = navigate;

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (entering && !reducedMotion()) {
      element.animate(
        [{ transform: `translateX(${entering * FOLLOW * 100}%)`, opacity: 0 }, { transform: "none" }],
        ENTER,
      );
    }
    entering = 0;
    if (!swipes(location)) return;

    let from: { x: number; y: number; time: number; id: number } | undefined;
    let swiping = false;
    let last = { x: 0, time: 0, velocity: 0 };
    const width = () => element.offsetWidth || 1;
    // The screen gives a little and dims toward where it goes: a hint of the turn, never a blank beside it.
    const frame = (dx: number) => ({
      transform: `translateX(${dx}px)`,
      opacity: String(1 - Math.min(1, Math.abs(dx) / (width() * FOLLOW)) * DIM),
    });
    const place = (dx: number) => {
      const { transform, opacity } = frame(dx);
      element.style.transform = dx ? transform : "";
      element.style.opacity = dx ? opacity : "";
    };
    const shown = (dx: number) => {
      if (reducedMotion()) return 0;
      return dx * (swipeTarget(location, dx < 0 ? 1 : -1) ? FOLLOW : RESIST);
    };
    const release = (dx: number, velocity: number) => {
      const step = turnOf(dx, velocity, width());
      const href = step === 0 ? undefined : swipeTarget(location, step);
      if (href && reducedMotion()) return go.current(href);
      const at = currentX(element);
      if (!href) {
        place(0);
        element.animate([frame(at), frame(0)], LEAVE);
        return;
      }
      const away = { transform: `translateX(${-step * width() * FOLLOW}px)`, opacity: "0" };
      const slide = element.animate([frame(at), away], LEAVE);
      element.style.opacity = "0";
      void slide.finished.then(() => {
        entering = step;
        go.current(href);
      });
    };
    const down = (event: PointerEvent) => {
      swiping = false;
      from =
        event.isPrimary && event.pointerType !== "mouse" && !keepsSideways(event.target, element)
          ? { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId }
          : undefined;
    };
    const move = (event: PointerEvent) => {
      if (!from || event.pointerId !== from.id) return;
      const dx = event.clientX - from.x;
      if (!swiping) {
        const kind = gestureOf(dx, event.clientY - from.y, event.timeStamp - from.time);
        if (kind === "unsure") return;
        if (kind === "other") {
          from = undefined;
          return;
        }
        swiping = true;
        last = { x: event.clientX, time: event.timeStamp, velocity: 0 };
      }
      const elapsed = Math.max(1, event.timeStamp - last.time);
      last = { x: event.clientX, time: event.timeStamp, velocity: ((event.clientX - last.x) / elapsed) * 1000 };
      place(shown(dx));
    };
    const up = (event: PointerEvent) => {
      if (!from || event.pointerId !== from.id) return;
      const dx = event.clientX - from.x;
      from = undefined;
      if (!swiping) return;
      if (event.type === "pointercancel") return release(0, 0);
      release(dx, last.velocity);
    };
    // A swipe that ends on a link or a card does not open it.
    const click = (event: MouseEvent) => {
      if (!swiping) return;
      event.preventDefault();
      event.stopPropagation();
      swiping = false;
    };
    element.addEventListener("pointerdown", down);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("pointercancel", up);
    element.addEventListener("click", click, true);
    return () => {
      element.removeEventListener("pointerdown", down);
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("pointercancel", up);
      element.removeEventListener("click", click, true);
    };
  }, [location]);

  return ref;
}

/** Where the finger left the screen, read back from its transform. */
function currentX(element: HTMLElement): number {
  return Number.parseFloat(element.style.transform.replace("translateX(", "")) || 0;
}
