import { type MouseEvent, type ReactNode, useLayoutEffect, useRef } from "react";
import { cx } from "../lib/cx.ts";
import { BAR_CHANGE, LAND_PULSE, reducedMotion } from "../lib/motion.ts";
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
 * sessions everywhere else, and a day names its content to VoiceOver. The card keeps the page gutter, like the
 * others (on a 320 px phone a column is 41 px wide, 44 tall).
 */
export function WeekStrip({ days, label, onSelect, footer }: Props) {
  const runs = days.flatMap((day) => day.marks.map((mark) => mark.minutes ?? 0));
  const heaviest = Math.max(60, ...runs);
  const tall = runs.some((minutes) => minutes > 0);
  const nav = useStripMotion(days, BAR / heaviest);
  return (
    <Surface variant="inset" className="flex flex-col gap-2 pt-2 pb-3">
      <nav ref={nav} aria-label={label} className="grid grid-cols-7">
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
              data-bars={day.key}
              className="flex origin-bottom items-end justify-center gap-0.5"
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

const barHeight = (minutes: number, scale: number) => Math.max(8, minutes * scale);

/** What the strip drew: its days, and each mark's day and height. */
type Drawn = { week: string; marks: Map<string, { day: string; height: number }> };

export function drawnOf(days: StripDay[], scale: number): Drawn {
  const marks = days.flatMap((day) =>
    day.marks.map((mark) => [mark.id, { day: day.key, height: barHeight(mark.minutes ?? 0, scale) }] as const),
  );
  return { week: days.map((day) => day.key).join(), marks: new Map(marks) };
}

/**
 * From one drawing to the next: the scale each bar starts from (0 for a bar new on its day), and the days a mark
 * landed on, in the same week only (another week is not a move).
 */
export function stripChanges(before: Drawn, after: Drawn) {
  const bars: [id: string, from: number][] = [];
  const landed = new Set<string>();
  // Another week arrives already drawn (it slid in beside this one): nothing grows.
  if (before.week !== after.week) return { bars, landed: [] };
  for (const [id, mark] of after.marks) {
    const was = before.marks.get(id);
    if (!was || was.day !== mark.day) {
      bars.push([id, 0]);
      landed.add(mark.day);
    } else if (was.height !== mark.height) bars.push([id, was.height / mark.height]);
  }
  return { bars, landed: [...landed] };
}

/**
 * The strip answers a change: each bar grows or shrinks from its old load to the new one (drawn at its new height,
 * then scaled from the old: transform only, its round ends intact once it settles), a new bar grows from its base,
 * and the day a session landed on pulses once. Nothing moves on the first paint, nor for another week.
 */
function useStripMotion(days: StripDay[], scale: number) {
  const nav = useRef<HTMLElement>(null);
  const drawn = useRef<Drawn>(undefined);
  useLayoutEffect(() => {
    const before = drawn.current;
    drawn.current = drawnOf(days, scale);
    const root = nav.current;
    if (!before || !root || reducedMotion()) return;
    const { bars, landed } = stripChanges(before, drawn.current);
    for (const [id, from] of bars) {
      root
        .querySelector(`[data-bar="${CSS.escape(id)}"]`)
        ?.animate([{ transform: `scaleY(${from})` }, { transform: "none" }], BAR_CHANGE);
    }
    for (const day of landed) {
      root
        .querySelector(`[data-bars="${CSS.escape(day)}"]`)
        ?.animate([{ transform: "none" }, { transform: "scale(1.08)" }, { transform: "none" }], LAND_PULSE);
    }
  }, [days, scale]);
  return nav;
}

function Mark({ mark, scale }: { mark: StripMark; scale: number }) {
  if (mark.minutes)
    return (
      <span
        data-bar={mark.id}
        className="w-2 origin-bottom rounded-full"
        style={{ height: barHeight(mark.minutes, scale), background: barFill(TONES[mark.tone].color) }}
      />
    );
  if (mark.tone === "strength") return <span className={cx("size-2 rounded-[3px]", TONES.strength.mid)} />;
  return <Dot size="md" className={TONES[mark.tone].mid} />;
}
