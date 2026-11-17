import { useState } from "react";
import type { Run } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { decimal, duration, momentLabel } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useSheet } from "../sheets/store.ts";
import { Figure, ToneWash } from "./parts.tsx";
import { contentKey } from "./today.ts";
import { WatchStatus } from "./WatchStatus.tsx";

/**
 * The session of the day, read in one second: when and whether it is on the watch, what (title, type, shape),
 * then the two numbers she runs by, duration and target pace. The card opens the detail; the steps unfold in it.
 */
export function RunCard({ run, today }: { run: Run; today: string }) {
  const [open, setOpen] = useState(false);
  const show = useSheet((s) => s.show);
  const sub = [run.mainSet, run.distanceKm && `${decimal(run.distanceKm)} km environ`].filter(Boolean).join(" · ");
  const longPace = run.pace.length > 5;
  return (
    <Surface as="article" className="flex flex-col overflow-hidden">
      <ToneWash tone={run.intensity} />
      {/* The whole card opens the detail; the watch and the steps toggle sit above this layer. */}
      <button
        type="button"
        aria-label={`Détail de la séance : ${run.title}`}
        onClick={() => show({ kind: "session", id: run.id })}
        className="absolute inset-0 rounded-card border-0 bg-transparent"
      />
      <div className="pointer-events-none relative flex flex-col gap-4 px-5 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <span className="t-strong py-2.5">
            {momentLabel(run.date, run.start, today)} · {run.start}
          </span>
          <WatchStatus run={run} className="pointer-events-auto relative" />
        </div>
        <div key={contentKey(run)} className="flip-in flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <SessionChip tone={run.intensity} />
            <h1 className="t-large text-balance">{run.title}</h1>
            {sub && <span className="t-sub">{sub}</span>}
          </div>
          {run.lightened && (
            <p className="t-cap m-0 flex items-start gap-2 rounded-row bg-warn-wash px-3 py-2 text-warn-deep">
              <Icon name="info" size={16} className="mt-px flex-none" />
              {run.lightened}
            </p>
          )}
          <SessionShape steps={run.steps} tone={run.intensity} className="h-11" />
          {/* A range of paces is too wide for the big size: both figures drop to the smaller one, side by side or stacked. */}
          <dl className="m-0 flex flex-wrap items-end gap-x-10 gap-y-3">
            <Figure label="Durée" value={duration(run.durationMin)} size={longPace ? "num" : "figure"} />
            <Figure label="Allure cible" value={run.pace} unit="/km" size={longPace ? "num" : "figure"} rolling />
          </dl>
        </div>
      </div>
      <div className="expand relative" data-open={open}>
        <ol className="m-0 flex list-none flex-col px-5 pt-3" aria-hidden={!open}>
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
        className="press t-label hairline-top relative mx-5 mt-4 flex min-h-12 items-center justify-center gap-1.5 border-x-0 border-b-0 bg-transparent text-ink"
      >
        {open ? "Masquer les étapes" : `Voir les ${run.steps.length} étapes`}
        <Icon name="chevronDown" size={16} stroke={2.5} className={cx("tab-pill", open && "rotate-180")} />
      </button>
    </Surface>
  );
}
