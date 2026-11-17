import { useDraggable } from "@dnd-kit/core";
import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, minutesOf } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { TONES } from "../../ui/tones.ts";
import { LegsTag } from "../add/StrengthList.tsx";
import { useSheet } from "../sheets/store.ts";
import { sheetFor, toneOf } from "../today/today.ts";

const cancelledOf = (item: Item) => "cancelled" in item && Boolean(item.cancelled);

function meta(item: Item): string {
  if (cancelledOf(item)) return "N'a pas lieu";
  if (item.kind === "run") return [duration(item.durationMin), item.mainSet].filter(Boolean).join(" · ");
  if (item.kind === "class") return `Jusqu'à ${item.end}`;
  return `${duration(minutesOf(item.end) - minutesOf(item.start))}, jusqu'à ${item.end}`;
}

/**
 * One line of a day, on a time column. A run sits on its type's wash with a rail of its color; strength and
 * revision get the rail only; a class is plain secondary text with a lock: the backdrop of her week.
 */
export function ItemRow({ item, lifted = false }: { item: Item; lifted?: boolean }) {
  const tone = TONES[toneOf(item)];
  const run = item.kind === "run";
  const quiet = item.kind === "class" || item.kind === "busy";
  const cancelled = cancelledOf(item);
  return (
    <div
      className={cx(
        "flex items-center gap-3 rounded-row pr-3 text-left",
        quiet ? "min-h-11 py-1.5" : "min-h-14 py-2",
        run ? tone.wash : lifted ? "bg-on-color" : "bg-transparent",
        lifted && "week-lift",
      )}
    >
      <span className={cx("t-sub w-12 flex-none pl-3 tabular-nums", run && "font-semibold text-ink")}>
        {item.start}
      </span>
      <span
        aria-hidden="true"
        className={cx("w-1 flex-none self-stretch rounded-full", quiet ? "bg-hairline" : tone.mid)}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          className={cx(
            "break-words",
            run ? "t-strong" : quiet ? "t-sub text-ink-2" : "t-body",
            cancelled && "line-through opacity-60",
          )}
        >
          {item.title}
        </span>
        <span className="t-cap">{meta(item)}</span>
      </span>
      {item.kind === "strength" && item.legs && !/jambe/i.test(item.title) && <LegsTag />}
      {item.kind === "class" && <Icon name="busy" size={16} className="flex-none text-ink-3" />}
    </div>
  );
}

/** A row that lifts after a 0.3 s press and can be dropped on another day. A tap opens it. */
export function DraggableItem({ item, disabled, past }: { item: Item; disabled: boolean; past: boolean }) {
  const show = useSheet((s) => s.show);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      aria-roledescription={disabled ? undefined : "séance déplaçable"}
      onClick={() => show(sheetFor(item))}
      className={cx(
        "week-press block w-full scroll-mb-(--space-under-tabbar) touch-manipulation rounded-row border-0 bg-transparent p-0",
        past && "week-past",
        isDragging && "week-ghost",
      )}
    >
      <ItemRow item={item} />
    </button>
  );
}
