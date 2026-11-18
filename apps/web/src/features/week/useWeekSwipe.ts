import { animate, useMotionValue, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { SPRING_SWIPE } from "../../lib/motion.ts";

/** A finger has to travel this far (px) before a swipe is told from a tap or a scroll. */
const SLOP = 10;
/** Past this share of the width, or flicked this fast (px/s), the swipe turns the week. */
const TURN_SHARE = 0.25;
const TURN_SPEED = 500;
/** A finger held still this long before it moves is a long press (the drag of a session), never a swipe. */
const HOLD_MS = 250;

/** -1 for the previous week, 1 for the next, 0 to stay. */
export function turnOf(dx: number, velocity: number, width: number): -1 | 0 | 1 {
  if (dx < -width * TURN_SHARE || velocity < -TURN_SPEED) return 1;
  if (dx > width * TURN_SHARE || velocity > TURN_SPEED) return -1;
  return 0;
}

/** A swipe moves sideways soon after the press; a scroll moves up or down, a long press waits first. */
export function gestureOf(dx: number, dy: number, heldMs: number): "unsure" | "swipe" | "other" {
  if (Math.hypot(dx, dy) < SLOP) return "unsure";
  return heldMs <= HOLD_MS && Math.abs(dx) >= Math.abs(dy) * 1.2 ? "swipe" : "other";
}

/**
 * Semaine, a carousel of weeks: as soon as a sideways swipe is told apart, the weeks on each side are drawn beside
 * this one (`active`) and all move with the finger. Past the threshold the next one springs into place and becomes
 * the week on screen; short of it, everything springs back and nothing is read. Reduced motion: the week switches at
 * once. A vertical move stays a scroll, a long press stays the drag of a session.
 * `ref` goes on what listens (the whole page), `x` on what moves.
 */
export function useWeekSwipe(turn: (step: -1 | 1) => void) {
  const x = useMotionValue(0);
  const still = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const latest = useRef({ turn, still });
  latest.current = { turn, still };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let from: { x: number; y: number; time: number; id: number } | undefined;
    let swiping = false;
    let last = { x: 0, time: 0, velocity: 0 };

    // The week beside sits one width and one gutter away (WeekScreen's Neighbour).
    const page = () =>
      element.offsetWidth + (Number.parseFloat(getComputedStyle(element).getPropertyValue("--spacing-gutter")) || 0);
    const settle = (step: -1 | 0 | 1) => {
      // The page that slid in becomes the week on screen in the same frame as x goes back to 0: no jump.
      flushSync(() => {
        if (step !== 0) latest.current.turn(step);
        setActive(false);
      });
      x.set(0);
    };
    const release = (dx: number, velocity: number) => {
      const step = turnOf(dx, velocity, element.offsetWidth);
      if (step !== 0 && latest.current.still) return settle(step);
      void animate(x, -step * page(), { ...SPRING_SWIPE, velocity }).then(() => settle(step));
    };
    const down = (event: PointerEvent) => {
      swiping = false;
      from =
        event.isPrimary && event.button === 0
          ? { x: event.clientX, y: event.clientY, time: event.timeStamp, id: event.pointerId }
          : undefined;
    };
    const move = (event: PointerEvent) => {
      if (!from || event.pointerId !== from.id) return;
      const dx = event.clientX - from.x;
      const dy = event.clientY - from.y;
      if (!swiping) {
        const kind = gestureOf(dx, dy, event.timeStamp - from.time);
        if (kind === "unsure") return;
        if (kind === "other") {
          from = undefined;
          return;
        }
        swiping = true;
        setActive(true);
        last = { x: event.clientX, time: event.timeStamp, velocity: 0 };
      }
      const elapsed = Math.max(1, event.timeStamp - last.time);
      last = { x: event.clientX, time: event.timeStamp, velocity: ((event.clientX - last.x) / elapsed) * 1000 };
      x.set(dx);
    };
    const up = (event: PointerEvent) => {
      if (!from || event.pointerId !== from.id) return;
      from = undefined;
      if (!swiping) return;
      if (event.type === "pointercancel") return release(0, 0);
      release(x.get(), last.velocity);
    };
    // A swipe that ends on a session does not open it.
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
  }, [x]);

  return { ref, x, active };
}
