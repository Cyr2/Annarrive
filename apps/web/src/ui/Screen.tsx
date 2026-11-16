import type { ReactNode } from "react";
import { cx } from "../lib/cx.ts";

export type Mood = "run" | "easy" | "long" | "rest" | "done" | "week" | "reggie";

const BACKDROPS: Record<Mood, string> = {
  run: "[background:var(--backdrop-run)] h-155",
  easy: "[background:var(--backdrop-easy)] h-140",
  long: "[background:var(--backdrop-long)] h-140",
  rest: "[background:var(--backdrop-rest)] h-140",
  done: "[background:var(--backdrop-done)] h-130",
  week: "[background:var(--backdrop-week)] h-105",
  reggie: "[background:var(--backdrop-reggie)] h-115",
};

/**
 * A tab's page: the colored backdrop the glass needs, fading into the background, then the content
 * padded away from the notch and from the floating tab bar. The page itself scrolls (native iOS scroll).
 */
export function Screen({ mood, children, className }: { mood: Mood; children: ReactNode; className?: string }) {
  return (
    <main className="relative min-h-dvh">
      <div aria-hidden="true" className={cx("pointer-events-none absolute inset-x-0 top-0", BACKDROPS[mood])}>
        <div className="absolute inset-x-0 bottom-0 h-60 bg-linear-to-b from-transparent to-bg" />
      </div>
      <div
        className={cx("relative mx-auto flex max-w-xl flex-col gap-6 px-4", className)}
        style={{
          paddingTop: "max(24px, calc(env(safe-area-inset-top) + 12px))",
          paddingBottom: "calc(var(--space-under-tabbar) + env(safe-area-inset-bottom))",
        }}
      >
        {children}
      </div>
    </main>
  );
}
