import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Button } from "../../ui/Button.tsx";
import { Glass } from "../../ui/Glass.tsx";
import { useSheet } from "../sheets/store.ts";
import { phaseBar, raceLine, TARGET_TAG } from "./program.ts";

/** The goal card: race, date and countdown, her target time, the phases of the plan. */
export function GoalCard({ program, today }: { program: Program; today: string }) {
  const show = useSheet((s) => s.show);
  const { goal } = program;
  if (program.maintenance) {
    return (
      <Glass as="article" className="flex flex-col gap-4 rounded-card p-5">
        <div className="flex flex-col gap-1">
          <span className="t-cap">Sans objectif</span>
          <h2 className="t-large">Mode entretien</h2>
          <span className="t-sub">2 à 3 courses faciles par semaine et une séance de qualité</span>
        </div>
        <Button variant="glass" onClick={() => show({ kind: "goal" })}>
          Choisir un objectif
        </Button>
      </Glass>
    );
  }
  const phases = phaseBar(program);
  return (
    <Glass as="article" className="flex flex-col gap-4 rounded-card p-5">
      <div className="flex flex-col gap-1">
        <span className="t-cap">Ton objectif</span>
        <h2 className="t-large">{goal.race}</h2>
        <span className="t-sub">{raceLine(program, today)}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="t-cap">{goal.targetTime ? "Chrono visé" : "Objectif"}</span>
          <span className="t-figure text-intense-ink">{goal.targetTime ?? "Finir"}</span>
        </div>
        {goal.targetTag && (
          <span className="t-cap rounded-tile bg-success-wash px-2.5 py-1 font-semibold text-success-ink">
            {TARGET_TAG[goal.targetTag]}
          </span>
        )}
      </div>
      <div className="hairline-top flex flex-col gap-2 pt-4">
        <div className="flex h-2 gap-1" aria-hidden="true">
          {phases.map((p) => (
            <span
              key={p.name}
              className={cx("rounded-full", p.current ? "bg-intense" : "bg-hairline-strong")}
              style={{ flex: p.weeks }}
            />
          ))}
        </div>
        <div className="t-cap flex gap-1">
          {phases.map((p) => (
            <span
              key={p.name}
              className={cx("min-w-0 truncate", p.current && "font-semibold text-text")}
              style={{ flex: p.weeks }}
            >
              {p.name}
            </span>
          ))}
        </div>
        <span className="t-sub">{program.phaseNote}</span>
      </div>
      <Button variant="glass" onClick={() => show({ kind: "goal" })}>
        Modifier l'objectif
      </Button>
    </Glass>
  );
}
