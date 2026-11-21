import { useId, useState } from "react";
import type { CalendarEvent } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { DraggableItem } from "./WeekItem.tsx";
import { classesSpan } from "./week.ts";

/** A day crowded with classes: one quiet glass line, "9 cours, 8:00 à 18:50", that opens to the list. */
export function ClassGroup({ items, past }: { items: CalendarEvent[]; past: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="flex flex-col">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        data-crumb="Groupe de cours"
        onClick={() => setOpen(!open)}
        data-variant="inset"
        className={cx(
          "surface press flex min-h-14 w-full items-center gap-3 rounded-row border-0 px-3 py-2 text-left text-ink",
          past && "week-past",
        )}
      >
        <span className="t-sub w-12 flex-none tabular-nums">{items[0]?.start}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-sub text-ink">{items.length} cours</span>
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
        <div className="flex flex-col gap-2 pt-2">
          {items.map((item) => (
            <DraggableItem key={item.id} item={item} past={past} disabled />
          ))}
        </div>
      </div>
    </div>
  );
}
