import type { Week } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Dot } from "../../ui/bits.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TONES } from "../../ui/tones.ts";
import { useGo } from "../useGo.ts";
import { splitDots, weekStrip } from "./today.ts";

/**
 * "Cette semaine": seven days. The run of a day is a bar in its color, the subject of the week; classes,
 * revision and strength are small dots, the backdrop. Past days step back. A day opens Semaine on that day.
 */
export function WeekStrip({ week, today, legend = true }: { week: Week; today: string; legend?: boolean }) {
  const go = useGo();
  const days = weekStrip(week, today);
  const shown = [...new Set(days.flatMap((day) => day.dots))];
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <h2 className="t-title">Cette semaine</h2>
        <a
          href="/semaine"
          onClick={(e) => {
            e.preventDefault();
            go("/semaine");
          }}
          className="t-body inline-flex min-h-11 items-center"
        >
          Tout voir
        </a>
      </div>
      <Surface variant="inset" className="grid grid-cols-7 px-1.5 py-2">
        {days.map((day) => {
          const { run, others } = splitDots(day.dots);
          const past = day.date < today;
          return (
            <button
              key={day.date}
              type="button"
              aria-label={`${day.day} ${day.number}${day.dots.length ? `, ${day.dots.map((t) => TONES[t].label).join(", ")}` : ""}`}
              aria-current={day.today ? "date" : undefined}
              onClick={() => go(`/semaine?jour=${day.date}`)}
              className={cx(
                "press flex min-h-11 flex-col items-center gap-1.5 border-0 bg-transparent py-1 text-ink",
                past && "opacity-55",
              )}
            >
              <span className={cx("t-cap", day.today && "font-semibold text-action")}>{day.letter}</span>
              <span
                className={cx(
                  "t-strong flex size-9 items-center justify-center rounded-full tabular-nums",
                  day.today && "bg-action text-on-color",
                )}
              >
                {day.number}
              </span>
              <span className={cx("h-1.5 w-6 rounded-full", run ? TONES[run].mid : "bg-transparent")} />
              <span className="flex h-1.5 gap-1">
                {others.map((tone) => (
                  <Dot key={tone} className={TONES[tone].mid} />
                ))}
              </span>
            </button>
          );
        })}
      </Surface>
      {legend && shown.length > 0 && (
        <div className="t-cap flex flex-wrap gap-x-4 gap-y-1 px-1">
          {shown.map((tone) => (
            <span key={tone} className="flex items-center gap-1.5">
              {splitDots([tone]).run ? (
                <span aria-hidden="true" className={cx("h-1.5 w-3 rounded-full", TONES[tone].mid)} />
              ) : (
                <Dot className={TONES[tone].mid} />
              )}
              {TONES[tone].label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
