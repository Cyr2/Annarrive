import { useEffect, useRef } from "react";
import { PULL_BACK as BACK, reducedMotion, PULL_SETTLE as SETTLE } from "../lib/motion.ts";
import { Icon } from "./Icon.tsx";

/** The pill follows half of the finger, up to MAX px; past THRESHOLD a release reads again, the pill waits at HOLD. */
const RESIST = 0.5;
const THRESHOLD = 64;
const MAX = 96;
const HOLD = 56;
const SIZE = 40;
/** Same rules as the week's swipe: told apart after 10 px, and a finger held still first is a long press. */
const SLOP = 10;
const HOLD_MS = 250;
const FADE = "opacity var(--duration-fade) linear";

/** A pull or not, once the finger has moved: down, at the top of the page, soon after it landed. */
export function isPull(dx: number, dy: number, heldMs: number, scrolled: number): "unsure" | "pull" | "other" {
  if (Math.hypot(dx, dy) < SLOP) return "unsure";
  return dy > Math.abs(dx) && heldMs <= HOLD_MS && scrolled <= 0 ? "pull" : "other";
}

/**
 * Pull a page down from its top to read it again, as on iPhone: the Actualiser arrows come down in a glass pill,
 * turning with the pull, turn on their own while it reads, then go back up. The browser's own pull stays off
 * (overscroll-behavior). Never under a sheet; a sideways swipe or a long press is not a pull. Actualiser stays the
 * way in for VoiceOver: the pill is decoration.
 */
export function PullToRefresh({ onRefresh }: { onRefresh: () => Promise<unknown> }) {
  const pill = useRef<HTMLDivElement>(null);
  const arrows = useRef<HTMLSpanElement>(null);
  const latest = useRef(onRefresh);
  latest.current = onRefresh;

  useEffect(() => {
    const box = pill.current;
    const turn = arrows.current;
    if (!box || !turn) return;
    let from: { x: number; y: number; time: number } | undefined;
    let pulling = false;
    let reading = false;
    let pulled = 0;
    let still = false;

    const place = (y: number, transition: string) => {
      pulled = y;
      const progress = Math.min(1, y / THRESHOLD);
      box.style.transition = still ? FADE : transition;
      box.style.transform = `translateY(${y}px)`;
      box.style.opacity = String(still ? Number(progress === 1) : progress);
      box.style.color = progress === 1 ? "var(--color-action)" : "";
      if (!still && !reading) turn.style.transform = `rotate(${progress * 180}deg)`;
    };
    const start = (event: TouchEvent) => {
      const touch = event.touches[0];
      from = undefined;
      if (reading || !touch || event.touches.length > 1 || scrollY > 0) return;
      if (document.querySelector('[role="dialog"]')) return;
      from = { x: touch.clientX, y: touch.clientY, time: event.timeStamp };
    };
    const move = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!from || !touch) return;
      const dy = touch.clientY - from.y;
      if (!pulling) {
        const kind = isPull(touch.clientX - from.x, dy, event.timeStamp - from.time, scrollY);
        if (kind === "unsure") return;
        if (kind === "other") {
          from = undefined;
          return;
        }
        pulling = true;
        still = reducedMotion();
      }
      place(Math.min(MAX, Math.max(0, dy * RESIST)), "none");
    };
    const end = () => {
      from = undefined;
      if (!pulling) return;
      pulling = false;
      if (pulled < THRESHOLD) return place(0, BACK);
      reading = true;
      place(HOLD, SETTLE);
      turn.classList.add("week-spin");
      latest.current().finally(() => {
        reading = false;
        turn.classList.remove("week-spin");
        place(0, BACK);
      });
    };
    addEventListener("touchstart", start, { passive: true });
    addEventListener("touchmove", move, { passive: true });
    addEventListener("touchend", end);
    addEventListener("touchcancel", end);
    return () => {
      removeEventListener("touchstart", start);
      removeEventListener("touchmove", move);
      removeEventListener("touchend", end);
      removeEventListener("touchcancel", end);
    };
  }, []);

  return (
    <div
      ref={pill}
      aria-hidden="true"
      className="ui-glass pointer-events-none fixed left-1/2 z-20 -ml-5 flex size-10 items-center justify-center rounded-full text-ink-2 opacity-0"
      style={{ top: `calc(env(safe-area-inset-top) - ${SIZE}px)` }}
    >
      <span ref={arrows} className="flex">
        <Icon name="change" size={20} stroke={2.2} />
      </span>
    </div>
  );
}
