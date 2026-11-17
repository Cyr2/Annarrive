import type { ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import { shapeOf } from "./session-shape.ts";
import { TONES, type Tone } from "./tones.ts";

type Step = { label: string; tone: "plain" | "hard" | "muted" };

/**
 * The session at a glance: warm-up, blocks and cool-down as rounded bars, height for effort, in the color of
 * its type. Decorative (the steps are written next to it), so VoiceOver skips it.
 */
export function SessionShape({ steps, tone, className }: { steps: Step[]; tone: Tone; className?: string }) {
  return (
    <div aria-hidden="true" className={cx("flex h-9 items-end gap-1", className)}>
      {shapeOf(steps).map((bar, i) => (
        <span
          // Bars have no identity of their own: their place is their key.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          className={cx("min-w-1 basis-0 rounded-[5px]", TONES[tone].mid)}
          style={{ flexGrow: bar.weight, height: `${bar.level * 100}%`, opacity: 0.45 + bar.level * 0.55 }}
        />
      ))}
    </div>
  );
}

type ChipProps = { tone: Tone; children?: ReactNode; className?: string };

/** The session's type as a small pill: its wash, a dot, its name in the deep tone. Defaults to the type's name. */
export function SessionChip({ tone, children, className }: ChipProps) {
  const style = TONES[tone];
  return (
    <span
      className={cx(
        "t-cap inline-flex min-h-6 items-center gap-1.5 self-start rounded-full px-2.5 font-semibold",
        style.wash,
        style.deep,
        className,
      )}
    >
      <span aria-hidden="true" className={cx("size-2 flex-none rounded-full", style.mid)} />
      {children ?? style.label}
    </span>
  );
}
