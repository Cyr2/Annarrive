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

/** Past the last tab the page gives a little, then stops (rubber band). */
const RESIST = 0.2;
/** The screen a swipe opened comes in from this side (1: from the right). */
let entering: -1 | 0 | 1 = 0;

/**
 * Swipe sideways to the tab beside, as between iOS pages: the screen follows the finger, and past a quarter of the
 * width (or flicked) it leaves and the next one slides in from the side it came from; short of it, it springs back.
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
      element.animate([{ transform: `translateX(${entering * 30}%)`, opacity: 0 }, { transform: "none" }], ENTER);
    }
    entering = 0;
    if (!swipes(location)) return;

    let from: { x: number; y: number; time: number; id: number } | undefined;
    let swiping = false;
    let last = { x: 0, time: 0, velocity: 0 };
    const place = (dx: number) => {
      element.style.transform = dx ? `translateX(${dx}px)` : "";
    };
    const shown = (dx: number) => {
      if (reducedMotion()) return 0;
      return swipeTarget(location, dx < 0 ? 1 : -1) ? dx : dx * RESIST;
    };
    const release = (dx: number, velocity: number) => {
      const step = turnOf(dx, velocity, element.offsetWidth);
      const href = step === 0 ? undefined : swipeTarget(location, step);
      if (href && reducedMotion()) return go.current(href);
      const to = href ? -step * element.offsetWidth : 0;
      const at = currentX(element);
      const slide = element.animate(
        [{ transform: `translateX(${at}px)` }, { transform: `translateX(${to}px)` }],
        LEAVE,
      );
      place(to);
      void slide.finished.then(() => {
        if (!href) return place(0);
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
