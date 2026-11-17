import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

const TONES = { action: "text-action", danger: "text-danger", ink: "text-ink" } as const;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: keyof typeof TONES;
  icon?: IconName;
  children: ReactNode;
};

/**
 * A text button, no glass: a sheet header's Annuler and OK, "Actualiser", "Placer", and a destructive row
 * ("Supprimer la séance") inside a list. 44 px tall.
 */
export function TextButton({ tone = "action", icon, className, children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(
        "press t-body inline-flex min-h-11 items-center justify-center gap-1.5 border-0 bg-transparent px-1 disabled:text-ink-3",
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={18} stroke={2.25} />}
      {children}
    </button>
  );
}
