import { useId, useState } from "react";
import type { CalendarEvent } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { DraggableItem } from "./WeekItem.tsx";
import { classesSpan } from "./week.ts";

/** A day crowded with classes: one line, "9 cours, 8:00 à 18:50", that opens to the list. */
export function ClassGroup({ items, past }: { items: CalendarEvent[]; past: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className={cx(
          "press flex min-h-11 w-full items-center gap-3 rounded-row border-0 bg-transparent py-1.5 pr-3 text-left",
          past && "week-past",
        )}
      >
        <span className="t-sub w-12 flex-none pl-3 tabular-nums">{items[0]?.start}</span>
        <span aria-hidden="true" className="w-1 flex-none self-stretch rounded-full bg-hairline" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-sub text-ink-2">{items.length} cours</span>
          <span className="t-cap">{classesSpan(items)}</span>
        </span>
        <Icon
          name="chevronDown"
          size={16}
          stroke={2.4}
          className={cx("flex-none text-ink-3 transition-transform", open && "rotate-180")}
        />
      </button>
      <div id={id} className="expand" data-open={open} inert={!open}>
        <div className="flex flex-col gap-0.5">
          {items.map((item) => (
            <DraggableItem key={item.id} item={item} past={past} disabled />
          ))}
        </div>
      </div>
    </>
  );
}
