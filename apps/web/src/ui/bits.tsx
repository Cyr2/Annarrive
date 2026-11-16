import { type ButtonHTMLAttributes, type ReactNode, useState } from "react";
import { cx } from "../lib/cx.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { TONES, type Tone } from "./tones.ts";

/** Small presentation pieces shared by the screens. */

/** 32 px rounded square with the kind's icon, as in every list of the mockups. */
export function IconTile({ tone, icon }: { tone: Tone; icon?: IconName }) {
  return (
    <span className={cx("flex size-8 flex-none items-center justify-center rounded-tile", TONES[tone].tile)}>
      <Icon name={icon ?? TONES[tone].icon} size={18} />
    </span>
  );
}

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode; icon?: IconName };

/** Glass pill: Reggie shortcuts. */
export function Chip({ children, icon, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      className={cx(
        "glass press t-label inline-flex min-h-11 flex-none items-center gap-2 rounded-full border-0 px-4 text-text shadow-glass-flat",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

/** Colored dot: week legend, timetable status. */
export function Dot({ className, size = "sm" }: { className: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cx("flex-none rounded-full", size === "sm" ? "size-1.5" : "size-2", className)}
    />
  );
}

/** Three dots while Reggie thinks. */
export function Typing({ label = "Reggie écrit" }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="glass bubble-reggie flex gap-1.5 self-start px-4 py-3.5">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
    </div>
  );
}

/**
 * A figure whose characters roll up to their new value when it changes (pace after Changer).
 * Nothing moves on first display; afterwards only the characters that differ roll.
 */
export function RollingText({ value, className }: { value: string; className?: string }) {
  const [shown, setShown] = useState({ value, from: value });
  if (shown.value !== value) setShown({ value, from: shown.value });
  return (
    <span className={className}>
      <span className="sr-only-label">{value}</span>
      {[...value].map((char, i) => {
        // A digit is its position: the key changes with the digit, which replays the roll.
        const key = `${i}-${char}`;
        return (
          <span key={key} aria-hidden="true" className={shown.from[i] === char ? undefined : "roll"}>
            {char}
          </span>
        );
      })}
    </span>
  );
}
