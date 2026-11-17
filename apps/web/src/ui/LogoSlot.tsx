import { cx } from "../lib/cx.ts";

/** Annarrivé's logo: the bib icon, drawn as the app icon (its rounded square is part of the file). */
export function LogoSlot({ size = 72, className }: { size?: number; className?: string }) {
  return <img src="/logo.svg" alt="Annarrivé" width={size} height={size} className={cx("flex-none", className)} />;
}
