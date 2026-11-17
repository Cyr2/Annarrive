import { useState } from "react";
import { cx } from "../lib/cx.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { TONES, type Tone } from "./tones.ts";

/** Small presentation pieces shared by the screens. */

/** 32 px rounded square with the kind's icon: its wash, the icon in its deep tone. */
export function IconTile({ tone, icon }: { tone: Tone; icon?: IconName }) {
  const style = TONES[tone];
  return (
    <span className={cx("flex size-8 flex-none items-center justify-center rounded-tile", style.wash, style.deep)}>
      <Icon name={icon ?? style.icon} size={18} />
    </span>
  );
}

/** Colored dot: week strip, status lines. Never the only carrier of a meaning: a word goes with it. */
export function Dot({ className, size = "sm" }: { className: string; size?: "sm" | "md" }) {
  return (
    <span
      aria-hidden="true"
      className={cx("flex-none rounded-full", size === "sm" ? "size-1.5" : "size-2", className)}
    />
  );
}

/** Reggie's dots while he thinks, with what he is doing when it takes longer ("Je vérifie"). */
export function Typing({ label = "Reggie écrit", text }: { label?: string; text?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      data-variant="widget"
      className="surface msg bubble-reggie t-body flex items-center gap-1.5 self-start px-4 py-3.5"
    >
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
      {text && <span className="pl-1.5">{text}</span>}
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
