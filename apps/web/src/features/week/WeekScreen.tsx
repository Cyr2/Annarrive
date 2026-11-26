import "./week.css";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import type { Week } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { daysBetween, mondayOf } from "../../lib/date.ts";
import { Button, Chip, IconButton } from "../../ui/controls.tsx";
import { EmptyState, LoadFailed } from "../../ui/EmptyState.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { PullToRefresh } from "../../ui/PullToRefresh.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { WeekStrip } from "../../ui/WeekStrip.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { useSheet } from "../sheets/store.ts";
import { useTabRoot } from "../tabRoot.ts";
import { useWeekFilter } from "./filter.ts";
import { RefreshRow, refreshTimetable } from "./RefreshRow.tsx";
import { useGridMode } from "./useGridMode.ts";
import { useWeekDrag } from "./useWeekDrag.ts";
import { useWeekMotion } from "./useWeekMotion.ts";
import { useWeekSwipe } from "./useWeekSwipe.ts";
import { WeekDay } from "./WeekDay.tsx";
import { WeekGrid } from "./WeekGrid.tsx";
import { ItemRow } from "./WeekItem.tsx";
import { type Day, FILTERS, type Filter, stripOf, weekDays, weekHeading } from "./week.ts";

/**
 * The week to draw: the one asked for, or, while it is read, the one already on screen (`fresh` false), so
 * Semaine suivante never shows a blank page. Undefined only on the first read or after a failure.
 */
function useShownWeek(offset: number) {
  const fresh = usePlan((s) => s.weeks[offset]);
  const failed = usePlan((s) => s.weekStatus[offset] === "error");
  const shown = useRef<Week | undefined>(undefined);
  if (fresh) shown.current = fresh;
  useEffect(() => {
    // The weeks on each side too, so an arrow or a swipe lands on one already read.
    const { loadWeek, weeks } = usePlan.getState();
    void loadWeek(offset).then(() =>
      Promise.all([offset + 1, offset - 1].filter((o) => !weeks[o]).map((o) => loadWeek(o))),
    );
  }, [offset]);
  return { week: fresh ?? (failed ? undefined : shown.current), fresh, failed };
}

/** The strip with the week's load and where it stands in the plan. */
function StripCard({ week, today, days, onExpand }: { week: Week; today: string; days: Day[]; onExpand?: () => void }) {
  const heading = weekHeading(week, today);
  return (
    <WeekStrip
      days={stripOf(days, (day) => `#day-${day.date}`)}
      label="Jours de la semaine"
      footer={
        <div className="flex items-end gap-1 pr-1 pl-4">
          <p className="t-sub m-0 flex min-w-0 flex-1 flex-wrap justify-between gap-x-3">
            <span className="t-label font-semibold text-ink">
              {heading.load}
              {heading.time && <span className="font-normal text-ink-2"> · {heading.time}</span>}
            </span>
            <span>{week.readOnly ? "Semaine passée" : heading.position}</span>
          </p>
          {onExpand && (
            <button
              type="button"
              aria-label="Vue calendrier"
              aria-pressed="false"
              onClick={onExpand}
              className="press -my-3 flex size-11 flex-none items-center justify-center border-0 bg-transparent p-0 text-ink"
            >
              <Icon name="expand" size={22} />
            </button>
          )}
        </div>
      }
    />
  );
}

/**
 * The week before or after, beside the one on screen while a finger swipes, so the page it pulls in is already
 * there. Only to look at: VoiceOver and the keyboard never reach it. Its place, at the right height, if not read yet.
 */
function Neighbour({ side, offset, today, filter }: { side: -1 | 1; offset: number; today: string; filter: Filter }) {
  const week = usePlan((s) => s.weeks[offset + side]);
  const days = week ? weekDays(week, today, filter) : [];
  return (
    <div
      inert
      aria-hidden="true"
      data-neighbour={side}
      className="absolute inset-y-0 flex w-full flex-col gap-6 overflow-hidden"
      style={{ left: `calc(${side} * (100% + var(--spacing-gutter)))` }}
    >
      {week ? <StripCard week={week} today={today} days={days} /> : <Skeleton className="h-full" />}
      {week && (
        <div className="flex flex-col gap-5">
          {days.map((day) => (
            <WeekDay key={day.date} day={day} readOnly dragging={false} />
          ))}
        </div>
      )}
    </div>
  );
}

type RowsProps = {
  days: Day[];
  /** The week still on screen while the next is read: quieter, and nothing moves. */
  stale: boolean;
  readOnly: boolean;
  drag: ReturnType<typeof useWeekDrag>;
  rows: ReturnType<typeof useWeekMotion>;
};

/** The days as a list, each row lifted by a long press onto another day. */
function WeekRows({ days, stale, readOnly, drag, rows }: RowsProps) {
  return (
    <DndContext {...drag.context}>
      <div
        ref={rows}
        data-dragging={Boolean(drag.active)}
        aria-busy={stale}
        className={cx("flex flex-col gap-5", stale && "week-stale")}
      >
        {days.map((day) => (
          <WeekDay
            key={day.date}
            day={day}
            readOnly={readOnly}
            dragging={Boolean(drag.active)}
            target={drag.targets.find((t) => t.date === day.date)}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={drag.dropAnimation}>
        {drag.active && <ItemRow item={drag.active} lifted />}
      </DragOverlay>
    </DndContext>
  );
}

/** Before the first week arrives: its place, or what failed and Réessayer. */
function WeekWaiting({ failed, offset }: { failed: boolean; offset: number }) {
  if (!failed) return <Skeleton label="Chargement de la semaine" />;
  return (
    <LoadFailed
      title="Semaine indisponible"
      what="cette semaine"
      onRetry={() => void usePlan.getState().loadWeek(offset)}
    />
  );
}

type HeaderProps = {
  range?: string;
  offset: number;
  onOffset: (offset: number) => void;
  /** Left out on a past week, read only. */
  onAdd?: () => void;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  /** Vue calendrier: opened from the strip card, closed by the cross at the header's start; the grid shows every kind. */
  grid: { shown: boolean; toggle: () => void };
};

/**
 * The arrows around the week's range, +, and the kinds to show. The range is ink; on another week a small return
 * arrow comes before it and touching it leads back, so nothing is added or shifts. The Semaine tab leads back too.
 */
function WeekHeader({ range = " ", offset, onOffset, onAdd, filter, onFilter, grid }: HeaderProps) {
  const chips = useRef<HTMLFieldSetElement>(null);
  // The kind kept from last time is in view on a narrow phone, not cut at the edge of its row.
  useEffect(() => {
    const row = chips.current;
    const chosen = row?.querySelector<HTMLElement>("[aria-pressed='true']");
    if (row && chosen) row.scrollLeft = chosen.offsetLeft + chosen.offsetWidth - row.clientWidth + 16;
  }, []);
  return (
    <header className="flex flex-col gap-1">
      <h1 className="sr-only-label">Semaine</h1>
      <div className="flex items-center gap-0.5">
        {grid.shown && (
          <IconButton
            icon="close"
            label="Vue calendrier"
            variant="tinted"
            tone="action"
            className="mr-1"
            aria-pressed
            onClick={grid.toggle}
          />
        )}
        <IconButton icon="chevronLeft" label="Semaine précédente" onClick={() => onOffset(offset - 1)} />
        <p
          aria-live="polite"
          className="t-range m-0 flex min-h-11 min-w-0 flex-1 items-center justify-center text-center"
        >
          {offset === 0 ? (
            <span className="line-clamp-2 text-balance">{range}</span>
          ) : (
            // The range itself leads back, as a title does in iOS: nothing appears or moves around it.
            <button
              type="button"
              onClick={() => onOffset(0)}
              className="press flex min-h-11 max-w-full items-center gap-0.5 border-0 bg-transparent p-0 text-ink"
            >
              <Icon name="back" size={14} stroke={2.5} className="flex-none text-action" />
              <span className="line-clamp-2 text-balance">{range}</span>
              <span className="sr-only-label">, revenir à cette semaine</span>
            </button>
          )}
        </p>
        <IconButton icon="chevronRight" label="Semaine suivante" onClick={() => onOffset(offset + 1)} />
        {onAdd && (
          <IconButton icon="plus" label="Ajouter" variant="tinted" tone="action" className="ml-1" onClick={onAdd} />
        )}
      </div>
      {/* Its own sideways scroll on a narrow phone: the week swipe leaves it alone (lib/swipe.ts). */}
      <fieldset
        ref={chips}
        className={cx(
          "fade-x -mx-4 m-0 min-w-0 gap-2 overflow-x-auto overscroll-x-contain border-0 px-4 py-2 [scrollbar-width:none]",
          grid.shown ? "hidden" : "flex",
        )}
      >
        <legend className="sr-only-label">Afficher</legend>
        {FILTERS.map((f) => (
          <Chip key={f.value} selected={filter === f.value} onClick={() => onFilter(f.value)}>
            {f.label}
          </Chip>
        ))}
      </fieldset>
    </header>
  );
}

/**
 * Semaine: the strip says the week at a glance (load per day, today, what is left), then each day on a time
 * column. A long press lifts a session onto another day; + adds strength, a revision or a busy slot.
 */
export default function WeekScreen() {
  const plan = usePlan();
  const show = useSheet((s) => s.show);
  const focus = new URLSearchParams(useSearch()).get("jour");
  const today = todayOf(plan);
  const [offset, setOffset] = useState(() => (focus ? Math.floor(daysBetween(mondayOf(today), focus) / 7) : 0));
  const { week, fresh, failed } = useShownWeek(offset);
  const drag = useWeekDrag(fresh, offset, today);
  const swipe = useWeekSwipe((step) => setOffset((current) => current + step));
  const rows = useWeekMotion(offset);
  const [filter, setFilter] = useWeekFilter();
  useTabRoot(() => setOffset(0));
  useEffect(() => {
    if (focus && week) document.getElementById(`day-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, week]);

  const grid = useGridMode();
  // A past week, or the one still on screen while the next is read: nothing moves.
  const locked = !fresh || fresh.readOnly;

  const days = week ? weekDays(week, today, filter) : [];
  const heading = week && weekHeading(week, today);
  const add = () => show({ kind: "add", date: fresh?.monday });
  const header = (
    <WeekHeader
      range={heading?.range}
      offset={offset}
      onOffset={setOffset}
      onAdd={week?.readOnly ? undefined : add}
      filter={filter}
      onFilter={setFilter}
      grid={grid}
    />
  );
  if (grid.shown && week)
    return (
      <WeekGrid days={weekDays(week, today)} readOnly={locked} landscape={grid.landscape} drag={drag} header={header} />
    );
  return (
    <Screen>
      <PullToRefresh onRefresh={refreshTimetable} />
      <div ref={swipe.ref} className="flex touch-pan-y flex-col gap-3">
        {header}

        {/* The week and, while a finger swipes, the ones on each side: they move together, nothing blank. */}
        <motion.div style={{ x: swipe.x }} className="relative flex flex-col gap-6">
          {swipe.active && <Neighbour side={-1} offset={offset} today={today} filter={filter} />}
          {swipe.active && <Neighbour side={1} offset={offset} today={today} filter={filter} />}
          {week && <StripCard week={week} today={today} days={days} onExpand={grid.toggle} />}
          {!week && <WeekWaiting failed={failed} offset={offset} />}

          {week && week.items.length === 0 && (
            <EmptyState
              icon="week"
              title="Rien de prévu pour l'instant"
              action={!week.readOnly && <Button onClick={add}>Ajouter</Button>}
            >
              Ta semaine se remplit le dimanche soir.
            </EmptyState>
          )}

          {week && week.items.length > 0 && (
            <WeekRows days={days} stale={!fresh} readOnly={locked} drag={drag} rows={rows} />
          )}

          {week && !week.readOnly && week.items.length > 0 && (
            <p className="t-cap m-0 px-4 text-center">
              Appuie longuement sur une séance pour la glisser vers un autre jour.
            </p>
          )}
          {week && <RefreshRow checkedAt={week.timetableCheckedAt} change={week.timetableChange} />}
        </motion.div>
      </div>
    </Screen>
  );
}
