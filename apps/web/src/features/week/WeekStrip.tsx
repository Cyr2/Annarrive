import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Surface } from "../../ui/Surface.tsx";
import { TONES } from "../../ui/tones.ts";
import { toneOf } from "../today/today.ts";
import { type Day, dayLabel } from "./week.ts";

type Props = { days: Day[]; heading: { load: string; time?: string; position?: string }; readOnly: boolean };

/** Tallest bar of the strip (px): the heaviest day of the week reaches it, the others in proportion. */
const BAR = 40;

/**
 * The week in one look: seven columns, each with a bar per run (height = its length, color = its type) and a
 * small mark for strength. Today wears the action blue, past days fade, classes stay out of it.
 */
export function WeekStrip({ days, heading, readOnly }: Props) {
  const heaviest = Math.max(60, ...days.map((d) => d.runMinutes));
  const marked = days.some((d) => d.items.some((item) => item.kind === "run" || item.kind === "strength"));
  return (
    <Surface className="flex flex-col gap-3 px-2 pt-3 pb-4">
      <nav aria-label="Jours de la semaine" className="grid grid-cols-7">
        {days.map((day) => (
          <a
            key={day.date}
            href={`#day-${day.date}`}
            aria-label={dayLabel(day)}
            aria-current={day.today ? "date" : undefined}
            className={cx(
              "press flex flex-col items-center gap-1.5 rounded-row py-1 no-underline",
              day.past && "opacity-45",
            )}
          >
            <span className={cx("t-cap", day.today ? "font-semibold text-action" : "text-ink-2")}>
              {day.title.charAt(0)}
            </span>
            <span
              className={cx(
                "t-label flex size-8 items-center justify-center rounded-full font-semibold tabular-nums",
                day.today ? "bg-action text-on-color" : "text-ink",
              )}
            >
              {day.date.slice(8).replace(/^0/, "")}
            </span>
            {marked && (
              <span aria-hidden="true" className="flex items-end gap-0.5" style={{ height: BAR }}>
                {day.items.map((item) => (
                  <Mark key={item.id} item={item} scale={BAR / heaviest} />
                ))}
              </span>
            )}
          </a>
        ))}
      </nav>
      <p className="t-sub m-0 flex flex-wrap justify-between gap-x-3 px-2">
        <span className="t-label font-semibold text-ink">
          {heading.load}
          {heading.time && <span className="font-normal text-ink-2"> · {heading.time}</span>}
        </span>
        <span>{readOnly ? "Semaine passée" : heading.position}</span>
      </p>
    </Surface>
  );
}

/** A run is a bar of its length; strength a short grey stub; anything else draws nothing. */
function Mark({ item, scale }: { item: Item; scale: number }) {
  if ("cancelled" in item && item.cancelled) return null;
  if (item.kind === "run") {
    return (
      <span
        className={cx("w-2 rounded-full", TONES[toneOf(item)].mid)}
        style={{ height: Math.max(8, item.durationMin * scale) }}
      />
    );
  }
  if (item.kind === "strength") return <span className={cx("h-2 w-2 rounded-full", TONES.strength.mid)} />;
  return null;
}
