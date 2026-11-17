import { useState } from "react";
import type { Run } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { decimal, duration, momentLabel } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TONES } from "../../ui/tones.ts";
import { usePlan } from "../plan/store.ts";
import { contentKey, WATCH_LABEL } from "./today.ts";

/** The session of the day (design/Main): time and watch status, title, main block and target pace, steps on tap. */
export function RunCard({ run, today }: { run: Run; today: string }) {
  const [open, setOpen] = useState(false);
  const sub = [duration(run.durationMin), run.distanceKm && `${decimal(run.distanceKm)} km environ`]
    .filter(Boolean)
    .join(" · ");
  return (
    <Surface as="article" className="flex flex-col gap-4 overflow-hidden px-5 pt-5 pb-1">
      {/* The type's wash lights the card's corner: the session reads before a word is read. */}
      <span
        aria-hidden="true"
        className={cx(
          "pointer-events-none absolute -top-16 -left-16 size-56 rounded-full opacity-70 blur-2xl",
          TONES[run.intensity].wash,
        )}
      />
      <div className="relative flex items-center justify-between gap-2">
        <span className="t-strong">
          {momentLabel(run.date, run.start, today)} · {run.start}
        </span>
        <WatchStatus run={run} />
      </div>
      <div key={contentKey(run)} className="flip-in relative flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <SessionChip tone={run.intensity} />
          <h1 className="t-large">{run.title}</h1>
          <span className="t-sub">{sub}</span>
          {run.lightened && (
            <span className="t-cap flex items-start gap-1.5 self-start rounded-row bg-warn-wash px-2.5 py-1 text-warn-deep">
              <Icon name="info" size={16} className="mt-px flex-none" />
              {run.lightened}
            </span>
          )}
        </div>
        <SessionShape steps={run.steps} tone={run.intensity} />
        <div className="hairline-top flex items-end justify-between gap-3 pt-4">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="t-cap">{run.mainSet ? "Bloc principal" : "Durée"}</span>
            <span className="t-title">{run.mainSet ?? duration(run.durationMin)}</span>
          </div>
          <div className="flex flex-col items-end gap-1 text-right">
            <span className="t-cap">Allure cible</span>
            <PaceValue value={run.pace} unit="/km" size={run.pace.length > 5 ? "title" : "figure"} rolling />
          </div>
        </div>
      </div>
      <div className="expand relative" data-open={open}>
        <ol className="m-0 flex list-none flex-col p-0" aria-hidden={!open}>
          {run.steps.map((step) => (
            <li key={step.label} className="hairline-top flex min-h-11 items-center justify-between gap-3 py-2">
              <span className={cx("t-body", step.tone === "hard" && "font-semibold")}>{step.label}</span>
              <PaceValue value={step.pace} className={step.tone === "muted" ? "text-ink-2!" : undefined} />
            </li>
          ))}
        </ol>
      </div>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="press t-strong hairline-top relative flex min-h-12 items-center justify-center gap-2 border-x-0 border-b-0 bg-transparent text-ink"
      >
        {open ? "Masquer les étapes" : "Voir les étapes"}
        <Icon name="chevronDown" size={16} stroke={2.5} className={cx("tab-pill", open && "rotate-180")} />
      </button>
    </Surface>
  );
}

function WatchStatus({ run }: { run: Run }) {
  if (!run.watch) return null;
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
      className="press t-cap flex min-h-11 items-center gap-1.5 rounded-full border-0 bg-warn-wash px-3 font-semibold text-warn-deep"
    >
      <Icon name="watch" size={16} />
      {label}
    </button>
  );
}
