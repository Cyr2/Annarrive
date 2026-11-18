import { cx } from "../../lib/cx.ts";
import { decimal, duration, relativeMoment } from "../../lib/date.ts";
import { tidy } from "../../lib/text.ts";
import { GroupLabel } from "../../ui/List.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { RoundAction } from "../../ui/RoundAction.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { useSheet } from "../sheets/store.ts";
import { ReggieAvatar, ToneWash } from "../today/parts.tsx";
import { WatchStatus } from "../today/WatchStatus.tsx";

/** Session detail: when and what, every step with its pace, Reggie's why, and the three ways to adjust it. */
export default function SessionSheet({ spec, ...sheet }: SheetProps<"session">) {
  const plan = usePlan();
  const show = useSheet((s) => s.show);
  const run = findRun(plan, spec.id);
  const today = todayOf(plan);
  if (!run) return null;
  const upcoming = run.date >= today;
  const facts = [duration(run.durationMin), run.distanceKm && `${decimal(run.distanceKm)} km environ`];
  return (
    <Sheet {...sheet} title={run.title} cancelLabel="Fermer">
      <Surface variant="inset" className="flex flex-col gap-3 overflow-hidden px-4 pt-2 pb-4">
        <ToneWash tone={run.intensity} />
        <div className="relative flex flex-wrap items-center justify-between gap-x-2">
          <span className="t-strong py-2.5">{relativeMoment(run.date, run.start, today)}</span>
          <WatchStatus run={run} />
        </div>
        <div className="relative flex flex-wrap items-center gap-2">
          <SessionChip tone={run.intensity} title={run.title} />
          <span className="t-sub">{tidy(facts.filter(Boolean).join(" · "))}</span>
        </div>
        <SessionShape steps={run.steps} tone={run.intensity} className="relative h-11" />
        {run.lightened && (
          <p className="t-cap relative m-0 flex items-start gap-2 rounded-row bg-warn-wash px-3 py-2 text-warn-deep">
            {run.lightened}
          </p>
        )}
      </Surface>
      <section className="flex flex-col gap-2">
        <GroupLabel>Étapes</GroupLabel>
        <Surface as="ol" variant="inset" className="m-0 list-none p-0">
          {run.steps.map((step) => (
            <li key={step.label} className="row">
              <span className={cx("t-body", step.tone === "hard" && "font-semibold")}>{step.label}</span>
              <PaceValue value={step.pace} className={cx("text-right", step.tone === "muted" && "text-ink-2!")} />
            </li>
          ))}
        </Surface>
      </section>
      <Surface as="section" variant="widget" aria-label="Pourquoi cette séance" className="flex gap-3 p-4">
        <ReggieAvatar />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="t-cap font-semibold text-reggie">Pourquoi cette séance</span>
          <p className="t-body m-0">{run.why}</p>
        </div>
      </Surface>
      {upcoming && (
        <div className="grid grid-cols-3 gap-2">
          <RoundAction label="Déplacer" icon="move" onClick={() => show({ kind: "move", id: run.id })} />
          <RoundAction label="Changer" icon="change" onClick={() => show({ kind: "change", id: run.id })} />
          <RoundAction label="Pas dispo" icon="close" onClick={() => show({ kind: "unavailable", id: run.id })} />
        </div>
      )}
    </Sheet>
  );
}
