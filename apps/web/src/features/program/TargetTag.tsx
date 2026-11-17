import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";

/** Reachable reads as done-able (green and a check), ambitious as a calm heads-up (amber and an info). */
const TAGS = {
  reachable: { label: "Atteignable", icon: "check", className: "bg-easy-wash text-easy-deep" },
  ambitious: { label: "Ambitieux", icon: "info", className: "bg-warn-wash text-warn-deep" },
} as const;

export type TargetKind = keyof typeof TAGS;

/** The gentle class of her own target. Never a proposed time, never discouraging. */
export function TargetTag({ kind, className }: { kind: TargetKind; className?: string }) {
  const tag = TAGS[kind];
  return (
    <span
      className={cx(
        "t-label inline-flex flex-none items-center gap-1 self-start rounded-full px-3 py-1 font-semibold",
        tag.className,
        className,
      )}
    >
      <Icon name={tag.icon} size={16} stroke={2.5} />
      {tag.label}
    </span>
  );
}

/** The onboarding server speaks French ("atteignable"); the app's tags are keyed in English. */
export const VERDICT_KIND = { atteignable: "reachable", ambitieux: "ambitious" } as const;
