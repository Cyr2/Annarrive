import { useDroppable } from "@dnd-kit/core";
import { cx } from "../../lib/cx.ts";
import { duration } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ClassGroup } from "./ClassGroup.tsx";
import { DraggableItem } from "./WeekItem.tsx";
import type { Day, DropTarget } from "./week.ts";
import { isDraggable } from "./week.ts";

type Props = { day: Day; readOnly: boolean; dragging: boolean; target?: DropTarget };

/**
 * A day of the week: its title, its running load, and its rows. A day with nothing is one quiet line.
 * While a session is held, a free day opens a dashed drop slot; a blocked one dims and says why.
 */
export function WeekDay({ day, readOnly, dragging, target }: Props) {
  const held = dragging && target;
  const empty = day.rows.length === 0;
  return (
    <section
      id={`day-${day.date}`}
      aria-labelledby={`title-${day.date}`}
      className={cx("flex scroll-mt-6 flex-col gap-2", !held && "week-dim", held && target.blocked && "week-blocked")}
    >
      <div className="flex min-h-7 flex-wrap items-baseline gap-x-2 px-1">
        <h2 id={`title-${day.date}`} className={cx("t-title whitespace-nowrap", day.past && "text-ink-2")}>
          {day.title}
        </h2>
        {day.note && <Note text={day.note} today={day.today} />}
        {day.runMinutes > 0 && (
          <span className="t-cap ml-auto flex flex-none items-center gap-1 self-center tabular-nums">
            <Icon name="run" size={14} />
            <span className="sr-only-label">Course : </span>
            {duration(day.runMinutes)}
          </span>
        )}
      </div>
      {(!empty || held) && (
        <Surface variant="inset" className="flex flex-col gap-0.5 p-1">
          {held && (target.blocked ? <Blocked reason={target.blocked} /> : <DropSlot target={target} />)}
          {day.rows.map((row) =>
            row.kind === "classes" ? (
              <ClassGroup key={row.items[0]?.id} items={row.items} past={day.past} />
            ) : (
              <DraggableItem
                key={row.item.id}
                item={row.item}
                past={day.past}
                disabled={!isDraggable(row.item, readOnly)}
              />
            ),
          )}
        </Surface>
      )}
    </section>
  );
}

function Note({ text, today }: { text: string; today: boolean }) {
  return (
    <span
      className={cx(
        "t-cap whitespace-nowrap",
        today && "rounded-full bg-action-wash px-2 py-0.5 font-semibold text-action",
      )}
    >
      {text}
    </span>
  );
}

/** A blocked day under the held session: the rule that forbids it, calmly. */
function Blocked({ reason }: { reason: string }) {
  return (
    <div className="t-cap flex min-h-12 items-center gap-2 rounded-row bg-fill px-3 text-ink">
      <Icon name="busy" size={16} className="flex-none" />
      {reason}
    </div>
  );
}

function DropSlot({ target }: { target: DropTarget }) {
  const { setNodeRef, isOver } = useDroppable({ id: target.date });
  return (
    <div
      ref={setNodeRef}
      data-over={isOver}
      className={cx(
        "week-slot flex min-h-14 items-center gap-3 rounded-row border-[1.5px] border-dashed px-3",
        isOver ? "border-action bg-action-wash" : "border-hairline-strong bg-on-color/60",
      )}
    >
      <span
        className={cx(
          "select-anim flex size-8 flex-none items-center justify-center rounded-full",
          isOver ? "bg-action text-on-color" : "bg-fill text-ink-2",
        )}
      >
        <Icon name={isOver ? "check" : "plus"} size={18} stroke={2.4} />
      </span>
      <span className="flex flex-col">
        <span className={cx("t-strong", isOver ? "text-action" : "text-ink")}>Déposer ici</span>
        <span className="t-cap">{isOver ? `Lâche pour la placer à ${target.start}` : `Libre à ${target.start}`}</span>
      </span>
    </div>
  );
}
