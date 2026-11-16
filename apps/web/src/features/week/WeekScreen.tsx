import { DndContext, DragOverlay } from "@dnd-kit/core";
import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { ago, daysBetween, mondayOf } from "../../lib/date.ts";
import { Button, IconButton } from "../../ui/Button.tsx";
import { Dot } from "../../ui/bits.tsx";
import { Glass } from "../../ui/Glass.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { useSheet } from "../sheets/store.ts";
import { useWeekDrag } from "./useWeekDrag.ts";
import { WeekDay } from "./WeekDay.tsx";
import { ItemRow } from "./WeekItem.tsx";
import { refreshLine, weekDays, weekHeading } from "./week.ts";

/** Semaine (design/Semaine): every day, drag and drop with drop slots, + to add, timetable refresh. */
export default function WeekScreen() {
  const plan = usePlan();
  const show = useSheet((s) => s.show);
  const focus = new URLSearchParams(useSearch()).get("jour");
  const today = todayOf(plan);
  const [offset, setOffset] = useState(() => (focus ? Math.floor(daysBetween(mondayOf(today), focus) / 7) : 0));
  const [refreshed, setRefreshed] = useState<string>();
  const week = plan.weeks[offset];
  const drag = useWeekDrag(week, offset, today);

  useEffect(() => {
    void usePlan.getState().loadWeek(offset);
  }, [offset]);
  useEffect(() => {
    if (focus && week) document.getElementById(`day-${focus}`)?.scrollIntoView({ block: "start" });
  }, [focus, week]);

  const refresh = async () => {
    let summary: string | undefined;
    const ok = await plan.run(async (client) => {
      summary = (await client.refreshTimetable()).summary;
    });
    if (ok) setRefreshed(refreshLine(summary));
  };

  const heading = week && weekHeading(week);
  return (
    <Screen mood="week">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="t-large">Semaine</h1>
          {!week?.readOnly && (
            <IconButton
              icon="plus"
              label="Ajouter"
              tone="dark"
              onClick={() => show({ kind: "add", date: week?.monday })}
            />
          )}
        </div>
        <Glass className="flex items-center justify-between rounded-seg px-1">
          <IconButton icon="chevronLeft" label="Semaine précédente" size={18} onClick={() => setOffset(offset - 1)} />
          <div className="flex flex-col items-center text-center">
            <span className="t-strong">{heading?.range ?? " "}</span>
            <span className="t-cap">{week?.readOnly ? "Semaine passée, en lecture seule" : heading?.summary}</span>
          </div>
          <IconButton icon="chevronRight" label="Semaine suivante" size={18} onClick={() => setOffset(offset + 1)} />
        </Glass>
        <div className="flex items-center justify-between px-1">
          <span className="t-cap flex items-center gap-1.5">
            <Dot size="md" className="bg-success" />
            {refreshed ?? (week ? `Emploi du temps à jour ${ago(week.timetableCheckedAt, new Date())}` : "")}
          </span>
          <Button variant="link" icon="change" className="t-label" onClick={() => void refresh()}>
            Actualiser
          </Button>
        </div>
      </div>

      {week && (
        <DndContext {...drag.context}>
          {weekDays(week, today).map((day) => (
            <WeekDay
              key={day.date}
              day={day}
              readOnly={week.readOnly}
              dragging={Boolean(drag.active)}
              target={drag.targets.find((t) => t.date === day.date)}
            />
          ))}
          <DragOverlay dropAnimation={drag.dropAnimation}>
            {drag.active && <ItemRow item={drag.active} lifted />}
          </DragOverlay>
        </DndContext>
      )}
    </Screen>
  );
}
