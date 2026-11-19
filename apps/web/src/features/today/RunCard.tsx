import { useState } from "react";
import type { Run } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { decimal, duration, momentLabel } from "../../lib/date.ts";
import { tidy } from "../../lib/text.ts";
import { Icon } from "../../ui/Icon.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { StepList } from "../../ui/StepList.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TalkLink } from "../reggie/TalkLink.tsx";
import { useSheet } from "../sheets/store.ts";
import { Figure, ToneWash } from "./parts.tsx";
import { contentKey, sessionDetail } from "./today.ts";
import { WatchStatus } from "./WatchStatus.tsx";

/**
 * The session of the day, read in one second: when and whether it is on the watch, what (title, type, shape),
 * then the two numbers she runs by, duration and target pace. The card opens the detail; the steps unfold in it.
 */
export function RunCard({ run, today }: { run: Run; today: string }) {
  const [open, setOpen] = useState(false);
  const show = useSheet((s) => s.show);
  const sub = [run.mainSet, run.distanceKm && `${decimal(run.distanceKm)} km environ`].filter(Boolean).join(" · ");
  const longPace = run.pace.includes(" à ");
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
            <SessionChip tone={run.intensity} title={run.title} />
            <h1 className="t-large text-balance">{run.title}</h1>
            {sub && <span className="t-sub">{tidy(sub)}</span>}
          </div>
          {run.lightened && (
            <div className="flex flex-col items-start rounded-row bg-warn-wash px-3 pt-2">
              <p className="t-cap m-0 text-warn-deep">{run.lightened}</p>
              <TalkLink
                context={sessionDetail(run, today)}
                about={{ screen: "today", sessionId: run.id }}
                question="Pourquoi ma séance est allégée ?"
                className="pointer-events-auto relative -ml-1 self-start text-left"
              />
            </div>
          )}
          <SessionShape steps={run.steps} tone={run.intensity} className="h-11" />
          {/* A range of paces is too wide for the big size: both figures drop to the smaller one, side by side or stacked. */}
          <dl className="m-0 flex flex-wrap items-end gap-x-10 gap-y-3">
            <Figure label="Durée" value={duration(run.durationMin)} size={longPace ? "num" : "figure"} />
            <Figure label="Allure cible" value={run.pace} size={longPace ? "num" : "figure"} rolling />
          </dl>
        </div>
      </div>
      {/* One step says what the card already says: no list to unfold. */}
      {run.steps.length > 1 && (
        <>
          <div className="expand relative" data-open={open}>
            <div aria-hidden={!open} className="hairline-top mx-5 mt-3">
              <StepList steps={run.steps} />
            </div>
          </div>
          <StepsToggle count={run.steps.length} open={open} onToggle={() => setOpen(!open)} />
        </>
      )}
      {run.steps.length <= 1 && <div className="h-5" />}
    </Surface>
  );
}

function StepsToggle({ count, open, onToggle }: { count: number; open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="press t-label hairline-top relative mx-5 mt-4 flex min-h-12 items-center justify-center gap-1.5 border-x-0 border-b-0 bg-transparent text-ink"
    >
      {open ? "Masquer les étapes" : `Voir les ${count} étapes`}
      <Icon name="chevronDown" size={16} stroke={2.5} className={cx("tab-pill", open && "rotate-180")} />
    </button>
  );
}
