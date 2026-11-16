import type { CSSProperties, ReactNode } from "react";
import { cx } from "../lib/cx.ts";

type Props = { label: string; className?: string; style?: CSSProperties; children: ReactNode };

/**
 * A set of toggle buttons (aria-pressed) in a fieldset, so VoiceOver reads the question before the choices.
 * The legend is for assistive tech; the visible title stays where the mockup puts it.
 */
export function ChoiceGroup({ label, className, style, children }: Props) {
  return (
    <fieldset className={cx("m-0 min-w-0 border-0 p-0", className)} style={style}>
      <legend className="sr-only-label">{label}</legend>
      {children}
    </fieldset>
  );
}
