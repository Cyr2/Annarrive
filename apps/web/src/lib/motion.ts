/**
 * The app's one motion system, JS side (the CSS side is the duration and ease tokens in styles/tokens.css).
 * Springs without bounce for anything that moves the layout, a small bounce only where something lands.
 * Every Motion tree sits in <MotionConfig reducedMotion="user">: under reduced motion only fades remain.
 */

/** iOS push and sheet: no overshoot. */
export const SPRING_STEP = { type: "spring", bounce: 0, duration: 0.45 } as const;
/** A sheet rising, or springing back after a short pull. */
export const SPRING_SHEET = { type: "spring", bounce: 0, duration: 0.4 } as const;
/** A sheet leaving: the iOS drawer curve, quicker than it came. */
export const EXIT_SHEET = { duration: 0.28, ease: [0.32, 0.72, 0, 1] } as const;
/** Fades (scrims, cross-fades). */
export const FADE = { duration: 0.2, ease: [0.23, 1, 0.32, 1] } as const;
/** Under reduced motion, what slid only fades (--duration-fade). */
export const FADE_REDUCED = { duration: 0.15, ease: "linear" } as const;
/** Glass bubbles of the guided tour: a small bounce as they land on their target. */
export const SPRING_BUBBLE = { type: "spring", bounce: 0.2, duration: 0.4 } as const;
/** A week swiped to the next one: it leaves quickly, the next one springs in following the finger's speed. */
export const SPRING_SWIPE = { type: "spring", bounce: 0, duration: 0.35 } as const;

/** The no-bounce spring as a CSS curve, for what plays without Motion (WAAPI): FLIPs on the first screen, the strip. */
const SPRING_CURVE =
  "linear(0, 0.11, 0.31, 0.503, 0.657, 0.771, 0.85, 0.904, 0.939, 0.962, 0.976, 0.985, 0.991, 0.994, 0.997, 0.998, 1)";
const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
/** Cards closing the gap a card left (Aujourd'hui). */
export const SLIDE_CARD = { duration: 400, easing: SPRING_CURVE } as const;
/** A row of the week sliding to its new day or hour. */
export const SLIDE_ROW = { duration: 450, easing: SPRING_CURVE } as const;
/** A bar of the week strip growing or shrinking to its new load. */
export const BAR_CHANGE = { duration: 350, easing: EASE_OUT } as const;
/** A tab swiped away leaves quickly; the one beside comes in from the other side, a touch slower. */
export const TAB_LEAVE = { duration: 200, easing: EASE_OUT } as const;
export const TAB_ENTER = { duration: 260, easing: EASE_OUT } as const;
/** The day a session landed on: its bars pulse once. */
export const LAND_PULSE = { duration: 300, easing: EASE_OUT } as const;

/** Pull to refresh: released past the threshold, the pill springs to where it waits; then, or short of it, goes back. */
export const PULL_SETTLE = "transform 0.4s var(--ease-drawer), opacity 0.4s var(--ease-drawer)";
export const PULL_BACK = "transform 0.3s var(--ease-out), opacity 0.3s var(--ease-out)";

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/** FLIP: the element is drawn where it now sits, then slides there from where it was. */
export function slideFrom(element: Element, dx: number, dy: number, timing: KeyframeAnimationOptions) {
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
  element.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], timing);
}
