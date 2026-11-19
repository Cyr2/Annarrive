import { useDraggable } from "@dnd-kit/core";
import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, minutesOf } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { TONES } from "../../ui/tones.ts";
import { LegsTag } from "../add/StrengthList.tsx";
import { useSheet } from "../sheets/store.ts";
import { nameOf, sheetFor, toneOf } from "../today/today.ts";
import { moveOptions } from "../useLoad.ts";

const cancelledOf = (item: Item) => "cancelled" in item && Boolean(item.cancelled);

function meta(item: Item): string {
  if (cancelledOf(item)) return "N'a pas lieu";
  if (item.kind === "run") return [duration(item.durationMin), item.mainSet].filter(Boolean).join(" · ");
  if (item.kind === "class") return [`Jusqu'à ${item.end}`, nameOf(item).detail].filter(Boolean).join(" · ");
  return `${duration(minutesOf(item.end) - minutesOf(item.start))}, jusqu'à ${item.end}`;
}

/**
 * One line of a day, on a time column, with a dot of its type's color, as in the iOS calendar's list. A run also
 * sits on its type's wash; a class is plain secondary text with a lock: the backdrop of her week.
 */
export function ItemRow({ item, lifted = false }: { item: Item; lifted?: boolean }) {
  const tone = TONES[toneOf(item)];
  const run = item.kind === "run";
  const quiet = item.kind === "class" || item.kind === "busy";
  const cancelled = cancelledOf(item);
  return (
    <div
      className={cx(
        // At 200 % zoom the title drops under its hour instead of breaking mid-word.
        "flex flex-wrap items-center gap-x-3 rounded-row pr-3 text-left",
        quiet ? "min-h-11 py-1.5" : "min-h-14 py-2",
        run ? tone.wash : lifted ? "bg-on-color" : "bg-transparent",
        lifted && "week-lift",
      )}
    >
      <span className={cx("t-sub w-14 min-w-max flex-none pl-3 tabular-nums", run && "font-semibold text-ink")}>
        {item.start}
      </span>
      <span
        aria-hidden="true"
        className={cx("size-2.5 flex-none rounded-full", quiet ? "bg-hairline-strong" : tone.mid)}
      />
      <span className="flex min-w-[9ch] flex-1 flex-col max-[260px]:pl-3">
        <span
          className={cx(
            "break-words",
            run ? "t-strong" : quiet ? "t-sub text-ink-2" : "t-body",
            cancelled && "text-ink-2 line-through",
          )}
        >
          {nameOf(item).title}
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
      data-row={item.id}
      {...attributes}
      {...listeners}
      aria-roledescription={disabled ? undefined : "séance déplaçable"}
      // dnd-kit marks a locked row aria-disabled, but a tap still opens it: VoiceOver must not read it as dimmed.
      aria-disabled={false}
      onClick={() => show(sheetFor(item))}
      // The 0.3 s press covers the slots' round trip: the allowed days are known when the session lifts.
      onPointerDown={() => !disabled && item.kind === "run" && moveOptions.start(item.id)}
      className={cx(
        "week-press block w-full touch-manipulation rounded-row border-0 bg-transparent p-0",
        past && "week-past",
        isDragging && "week-ghost",
      )}
    >
      <ItemRow item={item} />
    </button>
  );
}
