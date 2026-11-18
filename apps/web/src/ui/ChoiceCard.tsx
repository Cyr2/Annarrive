import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import { Icon } from "./Icon.tsx";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type" | "children"> & {
  on: boolean;
  /** Reggie's own replies select in his green. */
  tone?: "action" | "reggie";
  /** row: the content then the mark, side by side. tile: a card in a grid, the mark at its top right. */
  layout?: "row" | "tile";
  /** A row of a list that is already a surface: no card of its own. */
  flat?: boolean;
  children: ReactNode;
};

/**
 * The one way a choice among cards or rows shows it is chosen, in every sheet and in the onboarding: a light tint,
 * a fine outline and a check in a circle (the empty circle on the others says "choose"). Never a dark fill.
 * Chips (ui/controls.tsx) use the same three signs on a pill. Put it in a `ChoiceGroup`.
 */
export function ChoiceCard({ on, tone = "action", layout = "row", flat = false, className, children, ...rest }: Props) {
  return (
    <button
      {...rest}
      type="button"
      aria-pressed={on}
      data-tone={tone}
      data-variant={flat ? undefined : "inset"}
      className={cx(
        "choice select-anim relative flex min-w-0 border-0 text-left text-ink",
        !flat && "surface press",
        layout === "row"
          ? cx("min-h-14 items-center gap-3 px-4", !flat && "py-3")
          : "min-h-30 flex-col items-start gap-2 p-4",
        className,
      )}
    >
      {children}
      <span
        aria-hidden="true"
        data-on={on}
        className={cx(
          "choice-mark select-anim flex size-6 flex-none items-center justify-center rounded-full",
          layout === "tile" ? "absolute top-3 right-3" : "ml-auto",
        )}
      >
        <Icon name="check" size={14} stroke={3} className="choice-check" />
      </span>
    </button>
  );
}
