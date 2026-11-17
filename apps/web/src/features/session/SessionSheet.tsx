import { cx } from "../../lib/cx.ts";
import { duration, relativeMoment } from "../../lib/date.ts";
import { Button } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { useSheet } from "../sheets/store.ts";
import { WATCH_LABEL } from "../today/today.ts";

/** Session detail: steps, paces, why this session, and the three ways to adjust it. */
export default function SessionSheet({ spec, ...sheet }: SheetProps<"session">) {
  const plan = usePlan();
  const show = useSheet((s) => s.show);
  const run = findRun(plan, spec.id);
  const today = todayOf(plan);
  if (!run) return null;
  const upcoming = run.date >= today;
  return (
    <Sheet {...sheet} title={run.title} cancelLabel="Fermer">
      <Surface variant="inset" className="flex flex-col gap-2 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SessionChip tone={run.intensity} />
          {run.watch && (
            <span className="t-cap flex items-center gap-1">
              <Icon name="watch" size={16} />
              {WATCH_LABEL[run.watch]}
            </span>
          )}
        </div>
        <span className="t-strong">
          {relativeMoment(run.date, run.start, today)} · {duration(run.durationMin)}
        </span>
        <SessionShape steps={run.steps} tone={run.intensity} />
      </Surface>
      <section className="flex flex-col gap-2">
        <h2 className="t-cap m-0 px-4">Étapes</h2>
        <Surface as="ol" variant="inset" className="m-0 list-none p-0">
          {run.steps.map((step) => (
            <li key={step.label} className="row">
              <span className={cx("t-body", step.tone === "hard" && "font-semibold")}>{step.label}</span>
              <PaceValue value={step.pace} className={cx("text-right", step.tone === "muted" && "text-ink-2!")} />
            </li>
          ))}
        </Surface>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="t-cap m-0 px-4">Pourquoi cette séance</h2>
        <Surface variant="inset" className="t-body m-0 px-4 py-3">
          {run.why}
        </Surface>
      </section>
      {run.lightened && <p className="t-cap m-0 px-4">{run.lightened}</p>}
      {upcoming && (
        <div className="grid grid-cols-3 gap-2">
          <Button onClick={() => show({ kind: "move", id: run.id })}>Déplacer</Button>
          <Button onClick={() => show({ kind: "change", id: run.id })}>Changer</Button>
          <Button onClick={() => show({ kind: "unavailable", id: run.id })}>Pas dispo</Button>
        </div>
      )}
    </Sheet>
  );
}
