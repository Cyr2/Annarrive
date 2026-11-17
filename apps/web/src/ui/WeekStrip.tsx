import type { MouseEvent, ReactNode } from "react";
import { cx } from "../lib/cx.ts";
import { Dot } from "./bits.tsx";
import { Surface } from "./Surface.tsx";
import { TONES, type Tone } from "./tones.ts";

/** A thing planned on a day: a run draws a bar of its length, strength a small square, the rest a dot. */
export type StripMark = { id: string; tone: Tone; minutes?: number };

export type StripDay = {
  key: string;
  /** "Lun": visible, and the start of the accessible name, so the two always agree. */
  short: string;
  number: string;
  /** What VoiceOver reads: starts with the visible text ("Lun 16 : 1 course"). */
  label: string;
  today: boolean;
  past: boolean;
  marks: StripMark[];
  href: string;
};

type Props = {
  days: StripDay[];
  label: string;
  /** Left out, the link does what a link does (a hash on the page). */
  onSelect?: (day: StripDay) => void;
  /** Under the seven days, inside the card. */
  footer?: ReactNode;
};

/** Tallest bar (px): the heaviest run of the week reaches it, the others in proportion. */
const BAR = 36;

/** A run's bar: its color rising out of a paler base, as the bars of the session's shape. */
const barFill = (color: string) =>
  `linear-gradient(to top, color-mix(in srgb, ${color} 55%, var(--color-on-color)), ${color})`;

/**
 * The week in one look, the same on Aujourd'hui and on Semaine: seven columns, each with its day, its number
 * (today in the action blue, past days grey) and what is planned. No legend: the colors are the ones of the
 * sessions everywhere else, and a day names its content to VoiceOver. Under 340 px the card bleeds a little past
 * the gutter so each column stays 44 px wide.
 */
export function WeekStrip({ days, label, onSelect, footer }: Props) {
  const runs = days.flatMap((day) => day.marks.map((mark) => mark.minutes ?? 0));
  const heaviest = Math.max(60, ...runs);
  const tall = runs.some((minutes) => minutes > 0);
  return (
    <Surface variant="inset" className="flex flex-col gap-2 pt-2 pb-3 max-[339px]:-mx-3">
      <nav aria-label={label} className="grid grid-cols-7">
        {days.map((day) => (
          <a
            key={day.key}
            href={day.href}
            aria-label={day.label}
            aria-current={day.today ? "date" : undefined}
            onClick={(event: MouseEvent) => {
              if (!onSelect) return;
              event.preventDefault();
              onSelect(day);
            }}
            className={cx(
              "press flex min-h-11 flex-col items-center gap-1 rounded-row py-1 text-ink no-underline",
              day.past && "text-ink-2 grayscale",
            )}
          >
            <span className={cx("t-cap", day.today && "font-semibold text-action")}>{day.short}</span>
            <span
              className={cx(
                "t-label flex size-8 items-center justify-center rounded-full tabular-nums",
                day.today && "bg-action text-on-color shadow-glow-action",
              )}
            >
              {day.number}
            </span>
            <span
              aria-hidden="true"
              className="flex items-end justify-center gap-0.5"
              style={{ height: tall ? BAR : 8 }}
            >
              {day.marks.map((mark) => (
                <Mark key={mark.id} mark={mark} scale={BAR / heaviest} />
              ))}
            </span>
          </a>
        ))}
      </nav>
      {footer}
    </Surface>
  );
}

function Mark({ mark, scale }: { mark: StripMark; scale: number }) {
  if (mark.minutes)
    return (
      <span
        className="w-2 rounded-full"
        style={{ height: Math.max(8, mark.minutes * scale), background: barFill(TONES[mark.tone].color) }}
      />
    );
  if (mark.tone === "strength") return <span className={cx("size-2 rounded-[3px]", TONES.strength.mid)} />;
  return <Dot size="md" className={TONES[mark.tone].mid} />;
}
