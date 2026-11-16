import { useDroppable } from "@dnd-kit/core";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { DraggableItem } from "./WeekItem.tsx";
import type { Day, DropTarget } from "./week.ts";
import { isDraggable } from "./week.ts";

type Props = { day: Day; readOnly: boolean; dragging: boolean; target?: DropTarget };

/** A day of the week. While a session is held, allowed days show a dashed drop slot, blocked ones dim with their reason. */
export function WeekDay({ day, readOnly, dragging, target }: Props) {
  const blocked = dragging && target?.blocked;
  if (day.items.length === 0 && !(dragging && target)) return null;
  return (
    <section
      id={`day-${day.date}`}
      className={cx("select-anim flex scroll-mt-6 flex-col gap-2", blocked && "opacity-45")}
    >
      <div className="flex items-baseline gap-2 px-1">
        <h2 className="t-title">{day.title}</h2>
        <span className="t-cap">{blocked || day.note}</span>
      </div>
      <div className="flex flex-col gap-1 rounded-group bg-surface p-1">
        {dragging && target && !target.blocked && <DropSlot target={target} />}
        {day.items.map((item) => (
          <DraggableItem key={item.id} item={item} disabled={!isDraggable(item, readOnly)} />
        ))}
      </div>
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
        isOver ? "border-assistant bg-assistant-wash" : "border-dash-line bg-bg",
      )}
    >
      <span className="flex size-8 flex-none items-center justify-center rounded-tile bg-surface text-text-secondary">
        <Icon name="plus" size={18} />
      </span>
      <span className="flex flex-col">
        <span className="t-strong text-text">Déposer ici</span>
        <span className="t-cap">{target.start} · créneau libre</span>
      </span>
    </div>
  );
}
