import { cx } from "../lib/cx.ts";

/**
 * Where Annarrivé's logo goes. The logo is being designed separately: this keeps its place and size (a rounded
 * square, like the app icon) without inventing a mark. Swap the inside for the logo once it exists.
 */
export function LogoSlot({ size = 72, className }: { size?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="Annarrivé"
      className={cx("surface flex flex-none items-center justify-center", className)}
      style={{ width: size, height: size, borderRadius: size * 0.28 }}
    >
      <span aria-hidden="true" className="t-title text-ink-3">
        A
      </span>
    </span>
  );
}
