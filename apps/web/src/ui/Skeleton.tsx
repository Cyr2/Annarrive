import { cx } from "../lib/cx.ts";
import { Surface } from "./Surface.tsx";

/**
 * The place of content still on its way, at its final height so nothing jumps when it lands. It breathes
 * slowly, and stays still under reduced motion. `label` is what VoiceOver says while it waits; a skeleton
 * without one is silent (the next ones of a list).
 */
export function Skeleton({ label, className }: { label?: string; className?: string }) {
  const speaks = label ? { role: "status", "aria-busy": true, "aria-label": label } : { "aria-hidden": true };
  return <Surface {...speaks} className={cx("motion-safe:animate-pulse", className ?? "h-96")} />;
}
