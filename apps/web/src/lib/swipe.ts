/** The rules shared by the sideways swipes (a week to the next, a tab to the next): no Motion, the first screen loads it. */

/** A finger has to travel this far (px) before a swipe is told from a tap or a scroll. */
const SLOP = 10;
/** Past this share of the width, or flicked this fast (px/s), a swipe turns the page. */
const TURN_SHARE = 0.25;
const TURN_SPEED = 500;
/** A finger held still this long before it moves is a long press (the drag of a session), never a swipe. */
const HOLD_MS = 250;

/** -1 for the page before, 1 for the next, 0 to stay. */
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

/** What keeps a sideways move for itself: fields, sliders and switches. */
const OWN_MOVES = "input, textarea, select, [contenteditable], [role='slider'], [role='switch']";

/** True when a press there is not a swipe: on a field or a slider, or in a row that scrolls sideways (chips). */
export function keepsSideways(target: EventTarget | null, root: Element): boolean {
  const start = target instanceof Element ? target : null;
  if (start?.closest(OWN_MOVES)) return true;
  for (let node = start; node && node !== root; node = node.parentElement) {
    if (node.scrollWidth > node.clientWidth && /auto|scroll/.test(getComputedStyle(node).overflowX)) return true;
  }
  return false;
}
