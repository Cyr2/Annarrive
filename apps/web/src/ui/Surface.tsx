import type { HTMLAttributes } from "react";
import { cx } from "../lib/cx.ts";

export type SurfaceVariant = "card" | "inset" | "sheet" | "widget";

type Props = HTMLAttributes<HTMLElement> & {
  /** card: a block of a screen. inset: a grouped list or a small block. sheet: a sheet's body. widget: Reggie's. */
  variant?: SurfaceVariant;
  as?: "div" | "article" | "section" | "ul" | "ol" | "dl";
};

/**
 * The content layer: light, nearly opaque frost with a lit rim and a soft ink shadow, so text stays crisp and
 * color can carry meaning. Solid under "Réduire la transparence" (styles/surfaces.css).
 */
export function Surface({ variant = "card", as: Tag = "div", className, ...rest }: Props) {
  return <Tag data-variant={variant} className={cx("surface", className)} {...rest} />;
}
