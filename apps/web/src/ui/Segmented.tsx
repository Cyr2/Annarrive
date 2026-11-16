import { cx } from "../lib/cx.ts";
import { ChoiceGroup } from "./ChoiceGroup.tsx";

type Item<T extends string> = { value: T; label: string };
type Props<T extends string> = {
  items: Item<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  label: string;
  /** "md" for full-width choices (ressenti), "sm" inside sheets. */
  size?: "md" | "sm";
};

/**
 * iOS segmented control. CSS, like the mockups, rather than glisse's lens version: it sits on the first
 * screen (ressenti après la course) and must not pull glisse into the initial bundle.
 */
export function Segmented<T extends string>({ items, value, onChange, label, size = "sm" }: Props<T>) {
  return (
    <ChoiceGroup
      label={label}
      className={cx("grid gap-1 bg-fill p-1", size === "md" ? "rounded-3xl" : "rounded-seg")}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const on = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(item.value)}
            className={cx(
              "select-anim border-0 px-2 text-text",
              size === "md" ? "t-body min-h-11 rounded-group" : "t-label min-h-10 rounded-thumb",
              on ? "bg-surface font-semibold shadow-thumb" : "bg-transparent font-normal!",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </ChoiceGroup>
  );
}
