import "./week.css";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import type { Week } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { daysBetween, mondayOf } from "../../lib/date.ts";
import { Button, IconButton } from "../../ui/controls.tsx";
import { EmptyState, LoadFailed } from "../../ui/EmptyState.tsx";
import { PullToRefresh } from "../../ui/PullToRefresh.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { WeekStrip } from "../../ui/WeekStrip.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { useSheet } from "../sheets/store.ts";
import { RefreshRow, refreshTimetable } from "./RefreshRow.tsx";
import { useWeekDrag } from "./useWeekDrag.ts";
import { useWeekMotion } from "./useWeekMotion.ts";
import { useWeekSwipe } from "./useWeekSwipe.ts";
import { WeekDay } from "./WeekDay.tsx";
import { ItemRow } from "./WeekItem.tsx";
import { type Day, stripOf, weekDays, weekHeading } from "./week.ts";

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
function StripCard({ week, today, days }: { week: Week; today: string; days: Day[] }) {
  const heading = weekHeading(week, today);
  return (
    <WeekStrip
      days={stripOf(days, (day) => `#day-${day.date}`)}
      label="Jours de la semaine"
      footer={
        <p className="t-sub m-0 flex flex-wrap justify-between gap-x-3 px-4">
          <span className="t-label font-semibold text-ink">
            {heading.load}
            {heading.time && <span className="font-normal text-ink-2"> · {heading.time}</span>}
          </span>
          <span>{week.readOnly ? "Semaine passée" : heading.position}</span>
        </p>
      }
    />
  );
}

/**
 * The week before or after, beside the one on screen while a finger swipes, so the page it pulls in is already
 * there. Only to look at: VoiceOver and the keyboard never reach it. Its place, at the right height, if not read yet.
 */
function Neighbour({ side, offset, today }: { side: -1 | 1; offset: number; today: string }) {
  const week = usePlan((s) => s.weeks[offset + side]);
  const days = week ? weekDays(week, today) : [];
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
  useEffect(() => {
    if (focus && week) document.getElementById(`day-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, week]);

  const days = week ? weekDays(week, today) : [];
  const heading = week && weekHeading(week, today);
  const add = () => show({ kind: "add", date: fresh?.monday });
  return (
    <Screen>
      <PullToRefresh onRefresh={refreshTimetable} />
      <div ref={swipe.ref} className="flex touch-pan-y flex-col gap-3">
        <header>
          <h1 className="sr-only-label">Semaine</h1>
          <div className="flex items-center gap-0.5">
            <IconButton icon="chevronLeft" label="Semaine précédente" onClick={() => setOffset(offset - 1)} />
            <p aria-live="polite" className="t-range m-0 min-w-0 flex-1 truncate text-center">
              {heading?.range ?? " "}
            </p>
            <IconButton icon="chevronRight" label="Semaine suivante" onClick={() => setOffset(offset + 1)} />
            {!week?.readOnly && (
              <IconButton icon="plus" label="Ajouter" variant="tinted" tone="action" className="ml-2" onClick={add} />
            )}
          </div>
        </header>

        {/* The week and, while a finger swipes, the ones on each side: they move together, nothing blank. */}
        <motion.div style={{ x: swipe.x }} className="relative flex flex-col gap-6">
          {swipe.active && <Neighbour side={-1} offset={offset} today={today} />}
          {swipe.active && <Neighbour side={1} offset={offset} today={today} />}
          {week && <StripCard week={week} today={today} days={days} />}
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
            <DndContext {...drag.context}>
              <div
                ref={rows}
                data-dragging={Boolean(drag.active)}
                aria-busy={!fresh}
                className={cx("flex flex-col gap-5", !fresh && "week-stale")}
              >
                {days.map((day) => (
                  <WeekDay
                    key={day.date}
                    day={day}
                    readOnly={week.readOnly || !fresh}
                    dragging={Boolean(drag.active)}
                    target={drag.targets.find((t) => t.date === day.date)}
                  />
                ))}
              </div>
              <DragOverlay dropAnimation={drag.dropAnimation}>
                {drag.active && <ItemRow item={drag.active} lifted />}
              </DragOverlay>
            </DndContext>
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
