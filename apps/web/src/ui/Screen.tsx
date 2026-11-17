import type { ReactNode } from "react";
import { cx } from "../lib/cx.ts";

/**
 * A tab's page over the sky (Sky.tsx, behind the whole app): the content padded away from the notch and from
 * the floating tab bar. The page itself scrolls (native iOS scroll).
 */
export function Screen({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className="relative min-h-dvh">
      <div
        className={cx("mx-auto flex max-w-xl flex-col gap-6 px-gutter", className)}
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
