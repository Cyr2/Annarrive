import "./week.css";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import type { Week } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { daysBetween, mondayOf } from "../../lib/date.ts";
import { Button, IconButton } from "../../ui/controls.tsx";
import { EmptyState, LoadFailed } from "../../ui/EmptyState.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { useSheet } from "../sheets/store.ts";
import { RefreshRow } from "./RefreshRow.tsx";
import { useWeekDrag } from "./useWeekDrag.ts";
import { WeekDay } from "./WeekDay.tsx";
import { ItemRow } from "./WeekItem.tsx";
import { WeekStrip } from "./WeekStrip.tsx";
import { weekDays, weekHeading } from "./week.ts";

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
    // The next week too, so the arrow lands on it at once.
    void usePlan
      .getState()
      .loadWeek(offset)
      .then(() => usePlan.getState().loadWeek(offset + 1));
  }, [offset]);
  return { week: fresh ?? (failed ? undefined : shown.current), fresh, failed };
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
  useEffect(() => {
    if (focus && week) document.getElementById(`day-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, week]);

  const days = week ? weekDays(week, today) : [];
  const heading = week && weekHeading(week, today);
  const add = () => show({ kind: "add", date: fresh?.monday });
  return (
    <Screen>
      <header className="flex flex-col gap-3">
        <h1 className="sr-only-label">Semaine</h1>
        <div className="flex items-center gap-0.5">
          <IconButton icon="chevronLeft" label="Semaine précédente" onClick={() => setOffset(offset - 1)} />
          <p aria-live="polite" className="t-strong m-0 min-w-0 flex-1 text-center text-balance">
            {heading?.range ?? " "}
          </p>
          <IconButton icon="chevronRight" label="Semaine suivante" onClick={() => setOffset(offset + 1)} />
          {!week?.readOnly && (
            <IconButton icon="plus" label="Ajouter" variant="tinted" tone="action" className="ml-2" onClick={add} />
          )}
        </div>
        {heading && <WeekStrip days={days} heading={heading} readOnly={Boolean(week?.readOnly)} />}
      </header>

      {!week && <WeekWaiting failed={failed} offset={offset} />}

      {week && week.items.length === 0 && (
        <EmptyState
          icon="week"
          title="Rien de prévu"
          action={!week.readOnly && <Button onClick={add}>Ajouter une séance</Button>}
        >
          Aucune course ni aucun cours cette semaine pour l'instant.
        </EmptyState>
      )}

      {week && week.items.length > 0 && (
        <DndContext {...drag.context}>
          <div
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
    </Screen>
  );
}
