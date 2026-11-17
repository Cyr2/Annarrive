import type { Run } from "../../api/schemas.ts";
import { duration, relativeMoment } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { useSheet } from "../sheets/store.ts";

/** The next session as a small card of the app: when, what, its shape, duration and pace. Opens its detail. */
export function NextRun({ run, today, label }: { run: Run; today: string; label: string }) {
  const show = useSheet((s) => s.show);
  return (
    <section className="flex flex-col gap-2">
      <h2 className="t-title px-1">{label}</h2>
      <button
        type="button"
        onClick={() => show({ kind: "session", id: run.id })}
        data-variant="inset"
        className="surface press flex w-full flex-col gap-3 border-0 p-4 text-left text-ink"
      >
        <span className="flex w-full items-center justify-between gap-2">
          <span className="t-cap">{relativeMoment(run.date, run.start, today)}</span>
          <Icon name="chevronRight" size={18} className="flex-none text-ink-3" />
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="t-strong">{run.title}</span>
          <SessionChip tone={run.intensity} />
        </span>
        <SessionShape steps={run.steps} tone={run.intensity} className="h-7 w-full" />
        <span className="flex w-full flex-wrap items-baseline justify-between gap-x-4">
          <PaceValue value={duration(run.durationMin)} />
          <PaceValue value={run.pace} unit="/km" className="ml-auto" />
        </span>
      </button>
    </section>
  );
}
