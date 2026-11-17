import type { Run } from "../../api/schemas.ts";
import { duration, relativeDay } from "../../lib/date.ts";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { SessionChip } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";

/** Rest day (design/Repos): one word, and what comes next. */
export function RestCard({ next, today }: { next?: Run; today: string }) {
  return (
    <Surface as="article" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <h1 className="t-large">Repos</h1>
        <span className="t-sub">Pas de course aujourd'hui</span>
      </div>
      {next && (
        <div className="hairline-top flex items-end justify-between gap-3 pt-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="t-cap">
              {relativeDay(next.date, today)} · {next.start}
            </span>
            <SessionChip tone={next.intensity}>{next.title}</SessionChip>
            <span className="t-sub">{duration(next.durationMin)}</span>
          </div>
          <PaceValue value={next.pace} unit="/km" className="text-right" />
        </div>
      )}
    </Surface>
  );
}
