import { DndContext, DragOverlay, useDraggable, useDroppable } from "@dnd-kit/core";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { TONES } from "../../ui/tones.ts";
import { useSheet } from "../sheets/store.ts";
import { itemTime, nameOf, sheetFor, toneOf } from "../today/today.ts";
import { moveOptions } from "../useLoad.ts";
import { GRID_FROM, GRID_HOURS, type Lane, lanesOf, lengthOf, placeOf } from "./grid.ts";
import type { useWeekDrag } from "./useWeekDrag.ts";
import { type Day, type DropTarget, isDraggable } from "./week.ts";

type Drag = ReturnType<typeof useWeekDrag>;
type Props = { days: Day[]; readOnly: boolean; landscape: boolean; drag: Drag; header: ReactNode };

const at = (hours: number) => `calc(${hours} * var(--hour))`;
const cancelledOf = (item: Item) => "cancelled" in item && Boolean(item.cancelled);

/**
 * Vue calendrier (semaine-v2, B): the days in columns from 7:00 to 22:00, each item at its hour in its kind's style,
 * work hatched. Seven days on a phone on its side; three upright, the others a sideways scroll away. A tap opens the
 * usual sheet; a long press lifts a session onto another day, under the same rules as the list.
 */
export function WeekGrid({ days, readOnly, landscape, drag, header }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const todayIndex = days.findIndex((day) => day.today);
  const monday = days[0]?.date;
  // Upright, the three days start at yesterday when today is in this week, else at Monday.
  useLayoutEffect(() => {
    const box = scroller.current;
    if (!box || landscape || !monday) return;
    const first = Math.min(Math.max(todayIndex - 1, 0), days.length - 3);
    box.scrollLeft = first * ((box.scrollWidth - box.clientWidth) / (days.length - 3));
  }, [landscape, todayIndex, monday, days.length]);
  const length = drag.active ? lengthOf(drag.active) : 0;
  return (
    <div className="week-grid-view">
      {header}
      <DndContext {...drag.context}>
        <div ref={scroller} data-landscape={landscape} className="week-grid-scroll">
          <div className="week-grid" data-dragging={Boolean(drag.active)}>
            <span className="week-grid-corner" />
            {days.map((day) => (
              <p key={day.date} className={cx("week-grid-head m-0", day.today && "text-action")}>
                <span className="t-tab block">{day.title.split(" ")[0]?.slice(0, 3)}</span>
                <span className="t-strong block tabular-nums">{Number(day.date.slice(8))}</span>
              </p>
            ))}
            <Axis />
            {days.map((day) => (
              <Column
                key={day.date}
                day={day}
                readOnly={readOnly}
                dragging={Boolean(drag.active)}
                length={length}
                target={drag.targets.find((t) => t.date === day.date)}
              />
            ))}
          </div>
        </div>
        <DragOverlay dropAnimation={drag.dropAnimation}>
          {drag.active && <BlockFace item={drag.active} lifted />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

/** The hours down the left, kept in view as the days scroll sideways. */
function Axis() {
  return (
    <div aria-hidden="true" className="week-grid-axis">
      {Array.from({ length: GRID_HOURS + 1 }, (_, i) => `${GRID_FROM / 60 + i}:00`).map((hour, i) => (
        <span key={hour} className="t-tab absolute right-1.5 -translate-y-1/2 tabular-nums" style={{ top: at(i) }}>
          {hour}
        </span>
      ))}
    </div>
  );
}

type ColumnProps = { day: Day; readOnly: boolean; dragging: boolean; length: number; target?: DropTarget };

/** A day: its items side by side where they overlap; while a session is held, its free slot or why it is closed. */
function Column({ day, readOnly, dragging, length, target }: ColumnProps) {
  const open = dragging && target !== undefined && !target.blocked;
  const { setNodeRef, isOver } = useDroppable({ id: day.date, disabled: !open });
  const shown = day.items.filter((item) => placeOf(item.start, lengthOf(item)));
  const lanes = lanesOf(shown);
  const blocked = dragging ? target?.blocked : undefined;
  return (
    <section
      ref={setNodeRef}
      aria-label={day.title}
      className={cx("week-grid-col", day.today && "week-grid-today", blocked && "week-grid-blocked")}
    >
      {shown.map((item) => (
        <Block key={item.id} item={item} lane={lanes.get(item.id)} readOnly={readOnly} past={day.past} />
      ))}
      {open && <Slot start={target.start} length={length} over={isOver} />}
      {blocked && <span className="week-grid-reason t-tab">{blocked}</span>}
      {day.today && <NowLine />}
    </section>
  );
}

type BlockProps = { item: Item; lane?: Lane; readOnly: boolean; past: boolean };

/** An item at its hour: a tap opens its sheet, a long press lifts a session (same press as the list). */
function Block({ item, lane = { lane: 0, lanes: 1 }, readOnly, past }: BlockProps) {
  const show = useSheet((s) => s.show);
  const disabled = !isDraggable(item, readOnly);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled });
  const place = placeOf(item.start, lengthOf(item)) ?? { top: 0, height: 0 };
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-row={item.id}
      {...attributes}
      {...listeners}
      aria-roledescription={disabled ? undefined : "séance déplaçable"}
      aria-disabled={false}
      aria-label={`${nameOf(item).title}, ${itemTime(item)}`}
      onClick={() => show(sheetFor(item))}
      onPointerDown={() => !disabled && item.kind === "run" && moveOptions.start(item.id)}
      className={cx("week-grid-item week-press", past && "week-past", isDragging && "week-ghost")}
      style={{
        top: at(place.top),
        height: at(place.height),
        left: `${(lane.lane / lane.lanes) * 100}%`,
        width: `${100 / lane.lanes}%`,
      }}
    >
      <BlockFace item={item} />
    </button>
  );
}

/** What a block shows, in its kind's style: a run's halo and filled disc, strength's outline, work hatched. */
function BlockFace({ item, lifted = false }: { item: Item; lifted?: boolean }) {
  const tone = toneOf(item);
  const { title, ue } = nameOf(item);
  const run = item.kind === "run";
  return (
    <span className={cx("week-grid-block", `week-grid-${item.kind}`, lifted && "week-lift")}>
      {run && <span aria-hidden="true" className={cx("week-grid-halo", TONES[tone].wash)} />}
      <span className="relative flex min-w-0 items-center gap-1">
        <KindMark item={item} />
        <span className={cx("t-tab min-w-0 flex-1 truncate text-ink", cancelledOf(item) && "line-through")}>
          {title}
        </span>
        {ue && (
          <span className={cx("t-tab flex-none rounded-full px-1", TONES[ue].wash, TONES[ue].deep)}>
            {TONES[ue].label}
          </span>
        )}
      </span>
      <span className="t-tab relative block truncate font-medium text-ink-2 tabular-nums">{itemTime(item)}</span>
    </span>
  );
}

/** The kind at a glance: a run's runner on its color, the dumbbell, the book, the briefcase; a class has its UE. */
function KindMark({ item }: { item: Item }) {
  const style = TONES[toneOf(item)];
  if (item.kind === "class") return null;
  if (item.kind === "run")
    return (
      <span className={cx("flex size-4 flex-none items-center justify-center rounded-full text-on-color", style.mid)}>
        <Icon name="run" size={11} stroke={2.4} />
      </span>
    );
  return <Icon name={style.icon} size={13} stroke={2.2} className={cx("flex-none", style.deep)} />;
}

/** Where the held session would land, at the hour the coach proposes for that day. */
function Slot({ start, length, over }: { start: string; length: number; over: boolean }) {
  const place = placeOf(start, length);
  if (!place) return null;
  return (
    <span
      data-over={over}
      className={cx("week-grid-slot", over ? "border-action bg-action-wash" : "border-action/60")}
      style={{ top: at(place.top), height: at(place.height) }}
    >
      <span className="sr-only-label">Déposer ici, à {start}</span>
    </span>
  );
}

/** Now, on today's column: a thin action-blue line with its dot, moved each minute. */
function NowLine() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  const place = placeOf(`${now.getHours()}:${String(now.getMinutes()).padStart(2, "0")}`, 1);
  if (!place) return null;
  return <span aria-hidden="true" className="week-grid-now" style={{ top: at(place.top) }} />;
}
