import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Button } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useSheet } from "../sheets/store.ts";
import { phaseBar, raceLine, TARGET_TAG } from "./program.ts";

/** Reachable reads as done-able (green and a check), ambitious as a calm heads-up (amber and an info). */
const TAG_STYLE = {
  reachable: { className: "bg-easy-wash text-easy-deep", icon: "check" },
  ambitious: { className: "bg-warn-wash text-warn-deep", icon: "info" },
} as const;

/** The goal card: race, date and countdown, her target time, the phases of the plan. */
export function GoalCard({ program, today }: { program: Program; today: string }) {
  const show = useSheet((s) => s.show);
  const { goal } = program;
  if (program.maintenance) {
    return (
      <Surface as="article" className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-1">
          <span className="t-cap">Sans objectif</span>
          <h2 className="t-large">Mode entretien</h2>
          <span className="t-sub">2 à 3 courses faciles par semaine et une séance de qualité</span>
        </div>
        <Button variant="tinted" onClick={() => show({ kind: "goal" })}>
          Choisir un objectif
        </Button>
      </Surface>
    );
  }
  const phases = phaseBar(program);
  const tag = goal.targetTag && TAG_STYLE[goal.targetTag];
  return (
    <Surface as="article" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <span className="t-cap">Ton objectif</span>
        <h2 className="t-large">{goal.race}</h2>
        <span className="t-sub">{raceLine(program, today)}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="t-cap">{goal.targetTime ? "Chrono visé" : "Objectif"}</span>
          <PaceValue value={goal.targetTime ?? "Finir"} size="figure" />
        </div>
        {goal.targetTag && tag && (
          <span className={cx("t-cap flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold", tag.className)}>
            <Icon name={tag.icon} size={14} stroke={2.5} />
            {TARGET_TAG[goal.targetTag]}
          </span>
        )}
      </div>
      <div className="hairline-top flex flex-col gap-2 pt-4">
        <div className="flex h-2 gap-1" aria-hidden="true">
          {phases.map((p) => (
            <span
              key={p.name}
              className={cx("rounded-full", p.current ? "bg-action" : "bg-hairline-strong")}
              style={{ flex: p.weeks }}
            />
          ))}
        </div>
        <div className="t-cap flex gap-1">
          {phases.map((p) => (
            <span
              key={p.name}
              className={cx("min-w-0 truncate", p.current && "font-semibold text-ink")}
              style={{ flex: p.weeks }}
            >
              {p.name}
            </span>
          ))}
        </div>
        <span className="t-sub">{program.phaseNote}</span>
      </div>
      <Button onClick={() => show({ kind: "goal" })}>Modifier l'objectif</Button>
    </Surface>
  );
}
