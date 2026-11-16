import { cx } from "../../lib/cx.ts";
import { duration, relativeMoment } from "../../lib/date.ts";
import { Button } from "../../ui/Button.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TONES } from "../../ui/tones.ts";
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
  const tone = TONES[run.intensity];
  const upcoming = run.date >= today;
  return (
    <Sheet {...sheet} title={run.title} cancelLabel="Fermer">
      <div className={cx("flex flex-col gap-1 rounded-row px-4 py-3", tone.wash)}>
        <span className={cx("t-strong", tone.deep)}>
          {relativeMoment(run.date, run.start, today)} · {duration(run.durationMin)}
        </span>
        {run.watch && <span className={cx("t-cap", tone.ink)}>{WATCH_LABEL[run.watch]}</span>}
      </div>
      <section className="flex flex-col gap-2">
        <h2 className="t-cap m-0 px-4">Étapes</h2>
        <ol className="group m-0 list-none p-0">
          {run.steps.map((step) => (
            <li key={step.label} className="row">
              <span className="t-body">{step.label}</span>
              <span className={cx("t-strong text-right", step.tone === "hard" ? "text-intense-ink" : "text-text")}>
                {step.pace}
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="t-cap m-0 px-4">Pourquoi cette séance</h2>
        <p className="t-body m-0 rounded-row bg-surface px-4 py-3">{run.why}</p>
      </section>
      {run.lightened && <p className="t-cap m-0 px-4">{run.lightened}</p>}
      {upcoming && (
        <div className="grid grid-cols-3 gap-2">
          <Button variant="tinted" onClick={() => show({ kind: "move", id: run.id })}>
            Déplacer
          </Button>
          <Button variant="tinted" onClick={() => show({ kind: "change", id: run.id })}>
            Changer
          </Button>
          <Button variant="tinted" onClick={() => show({ kind: "unavailable", id: run.id })}>
            Pas dispo
          </Button>
        </div>
      )}
    </Sheet>
  );
}
