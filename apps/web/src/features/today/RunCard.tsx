import { useState } from "react";
import type { Run } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, momentLabel } from "../../lib/date.ts";
import { RollingText } from "../../ui/bits.tsx";
import { Glass } from "../../ui/Glass.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { usePlan } from "../plan/store.ts";
import { contentKey, WATCH_LABEL } from "./today.ts";

const PACE_TONE = { hard: "text-intense-ink", easy: "text-easy-ink", long: "text-long-ink" } as const;
const STEP_TONE = { plain: "text-text", hard: "text-intense-ink", muted: "text-text-secondary" } as const;

/** The session of the day (design/Main): time and watch status, title, main block and target pace, steps on tap. */
export function RunCard({ run, today }: { run: Run; today: string }) {
  const [open, setOpen] = useState(false);
  const sub = [duration(run.durationMin), run.distanceKm && `${run.distanceKm} km environ`].filter(Boolean).join(" · ");
  return (
    <Glass as="article" className="flex flex-col gap-4 rounded-card px-5 pt-5 pb-1">
      <div className="flex items-center justify-between gap-2">
        <span className="t-strong">
          {momentLabel(run.date, run.start, today)} · {run.start}
        </span>
        <WatchStatus run={run} />
      </div>
      <div key={contentKey(run)} className="flip-in flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="t-large">{run.title}</h1>
          <span className="t-sub">{sub}</span>
          {run.lightened && (
            <span className="t-cap flex items-start gap-1.5 pt-1 text-text">
              <Icon name="info" size={16} className="mt-px flex-none" />
              {run.lightened}
            </span>
          )}
        </div>
        <div className="hairline-top flex items-end justify-between gap-3 pt-4">
          <div className="flex flex-col gap-1">
            <span className="t-cap">{run.mainSet ? "Bloc principal" : "Durée"}</span>
            <span className="t-title">{run.mainSet ?? duration(run.durationMin)}</span>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="t-cap">Allure cible</span>
            <span className={cx(run.pace.length > 5 ? "t-title" : "t-figure", PACE_TONE[run.intensity])}>
              <RollingText value={run.pace} />
              <span className="t-sub tracking-normal"> /km</span>
            </span>
          </div>
        </div>
      </div>
      <div className="expand" data-open={open}>
        <ol className="m-0 flex list-none flex-col p-0" aria-hidden={!open}>
          {run.steps.map((step) => (
            <li key={step.label} className="hairline-top flex min-h-11 items-center justify-between gap-3">
              <span className="t-body">{step.label}</span>
              <span className={cx("t-strong text-right", STEP_TONE[step.tone])}>{step.pace}</span>
            </li>
          ))}
        </ol>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="press t-strong hairline-top flex min-h-12 items-center justify-center gap-2 border-x-0 border-b-0 bg-transparent text-text"
      >
        {open ? "Masquer les étapes" : "Voir les étapes"}
        <Icon name="chevronDown" size={16} stroke={2.5} className={cx("tab-pill", open && "rotate-180")} />
      </button>
    </Glass>
  );
}

function WatchStatus({ run }: { run: Run }) {
  const label = WATCH_LABEL[run.watch];
  if (run.watch !== "failed") {
    return (
      <span className="t-cap flex items-center gap-1">
        <Icon name="watch" size={16} />
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void usePlan.getState().run((api) => api.resendToWatch(run.id))}
      className="press t-cap flex min-h-11 items-center gap-1 border-0 bg-transparent p-0 font-semibold text-danger"
    >
      <Icon name="watch" size={16} />
      {label}
    </button>
  );
}
