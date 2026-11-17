import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, minutesOf } from "../../lib/date.ts";
import { IconTile } from "../../ui/bits.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TONES } from "../../ui/tones.ts";
import { useSheet } from "../sheets/store.ts";
import { agenda, endOf, sheetFor, toneOf } from "./today.ts";

/** "Cours · 2 h": the kind (unless the title already says it) and how long it lasts. */
function caption(item: Item): string {
  const label = TONES[toneOf(item)].label;
  const end = item.kind === "run" ? endOf(item) : item.end;
  const length = duration(minutesOf(end) - minutesOf(item.start));
  return item.title.toLowerCase().startsWith(label.toLowerCase()) ? length : `${label} · ${length}`;
}

/**
 * "Ma journée" as a timeline: the start time in a column she can scan, then the item. The run carries its
 * color down a short rail; classes stay neutral, they are the frame of her day. Each row opens its own card.
 */
export function DayAgenda({ items, date }: { items: Item[]; date: string }) {
  const show = useSheet((s) => s.show);
  const list = agenda(items, date);
  if (list.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="t-title px-1">Ma journée</h2>
      <Surface as="ul" variant="inset" className="m-0 list-none px-0 py-1">
        {list.map((item, index) => {
          const cancelled = "cancelled" in item && item.cancelled;
          const run = item.kind === "run";
          const tone = toneOf(item);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => show(sheetFor(item))}
                className="press flex w-full items-stretch gap-3 border-0 bg-transparent pl-4 text-left text-ink"
              >
                <span className="flex w-11 flex-none flex-col justify-center py-3 tabular-nums">
                  <span className="t-strong">{item.start}</span>
                  <span className="t-cap">{run ? endOf(item) : item.end}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cx("my-3 w-1 flex-none rounded-full", run ? TONES[tone].mid : "bg-hairline")}
                />
                <span
                  className={cx(
                    "flex min-h-16 min-w-0 flex-1 items-center gap-3 py-3 pr-4",
                    index < list.length - 1 && "border-b-[0.5px] border-hairline",
                  )}
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cx(run ? "t-strong" : "t-body", cancelled && "text-ink-2 line-through")}>
                      {item.title}
                    </span>
                    <span className="t-cap">{cancelled ? "N'a pas lieu" : caption(item)}</span>
                  </span>
                  <IconTile tone={tone} />
                </span>
              </button>
            </li>
          );
        })}
      </Surface>
    </section>
  );
}
