import { cx } from "../lib/cx.ts";
import { RollingText } from "./bits.tsx";

const SIZES = { figure: "t-figure", num: "t-num", title: "t-title", strong: "t-strong" } as const;

type Props = {
  /** "4:55", "6:15 à 6:45", "1:48:00", "8,3". A unit already in the value ("4:55 /km") is split off. */
  value: string;
  unit?: string;
  size?: keyof typeof SIZES;
  /** Digits roll to their new value when it changes (the pace after Changer). */
  rolling?: boolean;
  className?: string;
};

/**
 * A pace, a time or a distance: always ink, tabular, the unit smaller in the secondary ink. Never colored:
 * the session's type is said by its chip or its bars, next to it.
 */
export function PaceValue({ value, unit, size = "strong", rolling = false, className }: Props) {
  const [number, inlineUnit] = splitUnit(value);
  const shownUnit = unit ?? inlineUnit;
  return (
    // Wraps only between its words ("5:25 à 6:29 /km"), never inside a figure: at 200 % zoom it stays whole.
    <span className={cx(SIZES[size], "text-ink tabular-nums", className)}>
      {rolling ? <RollingText value={number} /> : number}
      {shownUnit && <span className="t-sub font-medium tracking-normal">{` ${shownUnit}`}</span>}
    </span>
  );
}

function splitUnit(value: string): [string, string | undefined] {
  const match = /^(.*\d)\s+(\/km|km|min|s)$/.exec(value);
  return match?.[1] && match[2] ? [match[1], match[2]] : [value, undefined];
}
