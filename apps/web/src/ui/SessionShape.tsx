import type { CSSProperties, ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import { type ShapeStep as Step, shapeOf } from "./session-shape.ts";
import { TONES, type Tone } from "./tones.ts";

const spoken = (step: Step): string =>
  "repeat" in step ? `répéter ${step.repeat} fois ${step.steps.map((s) => s.label).join(" puis ")}` : step.label;

/**
 * The session's effort profile: one bar per block, its height the effort. Every repeat is drawn, with its
 * recovery low between them; warm-up and cool-down are flat and pale, the hard blocks rise in a gradient of the
 * type's color (styles: .shape-bar in app.css). VoiceOver reads the steps from its label.
 */
export function SessionShape({ steps, tone, className }: { steps: Step[]; tone: Tone; className?: string }) {
  const color: CSSProperties & Record<"--tone", string> = { "--tone": TONES[tone].color };
  const bars = shapeOf(steps);
  // An easy run has no hard block: its steady part is the work, drawn in full color.
  const steady = !bars.some((bar) => bar.kind === "hard");
  return (
    <div
      role="img"
      aria-label={`Profil de la séance : ${steps.map(spoken).join(", ")}`}
      className={cx("flex h-9 items-end gap-[3px]", className)}
      style={color}
    >
      {bars.map((bar, i) => (
        <span
          // Bars have no identity of their own: their place is their key.
          // biome-ignore lint/suspicious/noArrayIndexKey: see above
          key={i}
          className="shape-bar"
          data-level={steady && bar.kind === "plain" ? "hard" : bar.kind}
          style={{ flexGrow: bar.weight, height: `${bar.level * 100}%` }}
        />
      ))}
    </div>
  );
}

type ChipProps = {
  tone: Tone;
  children?: ReactNode;
  className?: string;
  /** The session's title next to it: a title that already names the type ("Footing facile") drops the chip. */
  title?: string;
};

/** The session's type as a small pill: its wash, a dot, its name in the deep tone. Defaults to the type's name. */
export function SessionChip({ tone, children, className, title }: ChipProps) {
  const style = TONES[tone];
  // Never say the same thing twice on a screen.
  if (!children && title?.toLowerCase().includes(style.label.toLowerCase())) return null;
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
