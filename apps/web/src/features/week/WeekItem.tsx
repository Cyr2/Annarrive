import { useDraggable } from "@dnd-kit/core";
import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration } from "../../lib/date.ts";
import { IconTile } from "../../ui/bits.tsx";
import { Grip, Icon } from "../../ui/Icon.tsx";
import { TONES } from "../../ui/tones.ts";
import { LegsTag } from "../add/StrengthList.tsx";
import { useSheet } from "../sheets/store.ts";
import { itemTime, sheetFor, toneOf } from "../today/today.ts";

function meta(item: Item): string {
  if ("cancelled" in item && item.cancelled) return "N'a pas lieu";
  return item.kind === "run" ? `${item.start} · ${duration(item.durationMin)}` : itemTime(item);
}

/** One row of the week (design/Semaine): runs in their color with a grip, other items plain, classes locked. */
export function ItemRow({ item, lifted = false }: { item: Item; lifted?: boolean }) {
  const isRun = item.kind === "run";
  const tone = TONES[toneOf(item)];
  const cancelled = "cancelled" in item && item.cancelled;
  return (
    <div
      className={cx(
        "flex min-h-14 items-center gap-3 rounded-row px-3 py-2 text-left",
        isRun ? tone.wash : "bg-surface",
        lifted && "lifted",
      )}
    >
      <IconTile tone={toneOf(item)} />
      <span className="flex flex-1 flex-col">
        <span
          className={cx(
            isRun ? "t-strong" : "t-body",
            isRun ? tone.deep : "text-text",
            cancelled && "line-through opacity-60",
          )}
        >
          {item.title}
        </span>
        <span className="t-cap">{meta(item)}</span>
      </span>
      {item.kind === "strength" && item.legs && <LegsTag />}
      {item.kind === "class" ? (
        <Icon name="busy" size={16} className="text-text-faint" />
      ) : (
        <span className="text-text-faint">
          <Grip />
        </span>
      )}
    </div>
  );
}

/** A row that lifts on long press and can be dropped on another day. A tap opens it. */
export function DraggableItem({ item, disabled }: { item: Item; disabled: boolean }) {
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
      className={cx("block w-full touch-manipulation border-0 bg-transparent p-0", isDragging && "opacity-30")}
    >
      <ItemRow item={item} />
    </button>
  );
}
