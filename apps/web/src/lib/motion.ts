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
