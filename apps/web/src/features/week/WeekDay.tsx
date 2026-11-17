import { useDroppable } from "@dnd-kit/core";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { DraggableItem } from "./WeekItem.tsx";
import type { Day, DropTarget } from "./week.ts";
import { isDraggable } from "./week.ts";

type Props = { day: Day; readOnly: boolean; dragging: boolean; target?: DropTarget };

/** A day of the week. While a session is held, allowed days show a dashed drop slot, blocked ones dim with their reason. */
export function WeekDay({ day, readOnly, dragging, target }: Props) {
  const blocked = dragging && target?.blocked;
  if (day.items.length === 0 && !(dragging && target)) return null;
  const today = day.note === "Aujourd'hui";
  return (
    <section
      id={`day-${day.date}`}
      className={cx("select-anim flex scroll-mt-6 flex-col gap-2", blocked && "opacity-45")}
    >
      <div className="flex items-center gap-2 px-1">
        <h2 className="t-title">{day.title}</h2>
        {blocked ? (
          <span className="t-cap">{blocked}</span>
        ) : (
          day.note && (
            <span className={cx("t-cap rounded-full px-2 py-0.5", today && "bg-action-wash font-semibold text-action")}>
              {day.note}
            </span>
          )
        )}
      </div>
      <Surface variant="inset" className="flex flex-col gap-1 p-1">
        {dragging && target && !target.blocked && <DropSlot target={target} />}
        {day.items.map((item) => (
          <DraggableItem key={item.id} item={item} disabled={!isDraggable(item, readOnly)} />
        ))}
      </Surface>
    </section>
  );
}

function DropSlot({ target }: { target: DropTarget }) {
  const { setNodeRef, isOver } = useDroppable({ id: target.date });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        "select-anim flex min-h-14 items-center gap-3 rounded-row border-[1.5px] border-dashed px-3",
        isOver ? "border-action bg-action-wash" : "border-hairline-strong bg-fill",
      )}
    >
      <span className="flex size-8 flex-none items-center justify-center rounded-tile bg-on-color text-ink-2">
        <Icon name="plus" size={18} />
      </span>
      <span className="flex flex-col">
        <span className="t-strong text-ink">Déposer ici</span>
        <span className="t-cap">{target.start} · créneau libre</span>
      </span>
    </div>
  );
}
