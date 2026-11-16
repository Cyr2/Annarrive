import type { Run } from "../../api/schemas.ts";
import { duration, relativeDay } from "../../lib/date.ts";
import { Glass } from "../../ui/Glass.tsx";

/** Rest day (design/Repos): one word, and what comes next. */
export function RestCard({ next, today }: { next?: Run; today: string }) {
  return (
    <Glass as="article" className="flex flex-col gap-4 rounded-card p-5">
      <div className="flex flex-col gap-1">
        <h1 className="t-large">Repos</h1>
        <span className="t-sub">Pas de course aujourd'hui</span>
      </div>
      {next && (
        <div className="hairline-top flex items-end justify-between gap-3 pt-4">
          <div className="flex flex-col gap-1">
            <span className="t-cap">
              {relativeDay(next.date, today)} · {next.start}
            </span>
            <span className="t-strong">
              {next.title} · {duration(next.durationMin)}
            </span>
          </div>
          <span className="t-strong text-right text-revision-ink">{next.pace}</span>
        </div>
      )}
    </Glass>
  );
}
