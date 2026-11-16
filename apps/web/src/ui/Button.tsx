import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import { Icon, type IconName } from "./Icon.tsx";

type Variant = "primary" | "tinted" | "tintedBlue" | "glass" | "link" | "danger";

const VARIANTS: Record<Variant, string> = {
  /** Main action at the bottom of a sheet: "Déplacer à…", "Valider". */
  primary: "min-h-13 w-full rounded-full bg-action px-5 t-strong text-on-accent",
  /** Secondary action in a widget: "Annuler", "Plutôt du repos". */
  tinted: "min-h-11 rounded-full bg-fill px-4 t-strong text-text",
  tintedBlue: "min-h-11 rounded-full bg-assistant-tint px-4 t-strong text-action",
  glass: "min-h-12 rounded-row bg-glass-button t-strong text-text",
  /** Text button: sheet header "Annuler" and "OK", "Actualiser". */
  link: "min-h-11 bg-transparent px-1 text-link",
  /** Destructive row: "Supprimer la séance", "Arrêter ce programme". */
  danger: "min-h-13 w-full bg-transparent t-body text-danger",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; icon?: IconName; children: ReactNode };

export function Button({ variant = "primary", icon, className, children, type = "button", ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(
        "press inline-flex items-center justify-center gap-2 border-0 disabled:opacity-40",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} size={16} stroke={2.25} />}
      {children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  tone?: "dark" | "plain" | "blue" | "blueTint";
  size?: number;
};

const ICON_TONES = {
  dark: "bg-text text-on-accent",
  plain: "bg-transparent text-text",
  blue: "bg-assistant text-on-accent",
  blueTint: "bg-assistant-tint text-assistant",
};

/** Round 44 px icon button. The label is required: it is what VoiceOver reads. */
export function IconButton({ icon, label, tone = "plain", size = 20, className, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      className={cx(
        "press flex size-11 flex-none items-center justify-center rounded-full border-0 disabled:opacity-40",
        ICON_TONES[tone],
        className,
      )}
      {...rest}
    >
      <Icon name={icon} size={size} stroke={2.25} />
    </button>
  );
}
