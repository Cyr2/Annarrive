import type { HTMLAttributes } from "react";
import { cx } from "../lib/cx.ts";

type Props = HTMLAttributes<HTMLElement> & { as?: "div" | "article" | "section" | "nav"; bar?: boolean };

/**
 * A Liquid Glass surface: translucent white over the colored backdrop, blurred and saturated, with a bright rim.
 * Plain CSS `backdrop-filter`, as in the mockups: glisse's bending lens costs too much on a full card on a phone.
 * Solid under "Réduire la transparence".
 */
export function Glass({ as: Tag = "div", bar = false, className, ...rest }: Props) {
  return <Tag className={cx(bar ? "glass-bar" : "glass", className)} {...rest} />;
}
