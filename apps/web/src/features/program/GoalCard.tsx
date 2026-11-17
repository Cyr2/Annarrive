import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { longDate } from "../../lib/date.ts";
import { Button } from "../../ui/controls.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { useSheet } from "../sheets/store.ts";
import { countdown, phaseBar } from "./program.ts";
import { TargetTag } from "./TargetTag.tsx";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One cell per week of the plan, grouped by phase: done and current weeks filled, the current one taller. */
function WeekBar({ program }: { program: Program }) {
  let week = 0;
  return (
    <div aria-hidden="true" className="flex h-3 items-center gap-2">
      {phaseBar(program).map((phase) => (
        <div key={phase.name} className="flex h-full flex-1 items-center gap-0.5" style={{ flexGrow: phase.weeks }}>
          {Array.from({ length: phase.weeks }, () => {
            week += 1;
            return (
              <span
                key={week}
                className={cx(
                  "flex-1 rounded-full",
                  week === program.weekIndex ? "h-3 shadow-glow-action" : "h-1.5",
                  week <= program.weekIndex ? "bg-action" : "bg-hairline-strong",
                )}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function Maintenance() {
  const show = useSheet((s) => s.show);
  return (
    <Surface as="article" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <span className="t-cap">Sans objectif</span>
        <h2 className="t-large m-0">Mode entretien</h2>
        <span className="t-sub">2 à 3 courses faciles par semaine et une séance de qualité.</span>
      </div>
      <Button variant="tinted" onClick={() => show({ kind: "goal" })}>
        Choisir un objectif
      </Button>
    </Surface>
  );
}

/** The goal at a glance: the race, the days left, her own target, and how far along the plan she is. */
export function GoalCard({ program, today }: { program: Program; today: string }) {
  const show = useSheet((s) => s.show);
  if (program.maintenance) return <Maintenance />;
  const { goal } = program;
  const left = countdown(goal.date, today);
  const current = phaseBar(program).find((p) => p.current);
  const note = program.phaseNote || (program.weekTotal ? `Semaine ${program.weekIndex} sur ${program.weekTotal}` : "");
  return (
    <Surface as="article" aria-label="Ton objectif" className="flex flex-col gap-5 p-5">
      <div className="flex flex-col gap-1">
        <span className="t-cap">Ton objectif</span>
        <h2 className="t-large m-0">{goal.race}</h2>
        <span className="t-sub">{capitalize(longDate(goal.date))}</span>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1">
          <span className="t-cap">{left.unit ? "Plus que" : "C'est aujourd'hui"}</span>
          <PaceValue value={left.value} unit={left.unit} size="figure" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="t-cap">{goal.targetTime ? "Chrono visé" : "Objectif"}</span>
          <PaceValue value={goal.targetTime ?? "La finir"} size="figure" />
        </div>
      </div>
      {goal.targetTag && <TargetTag kind={goal.targetTag} className="-mt-2" />}
      {program.phases.length > 0 && (
        <div className="hairline-top flex flex-col gap-3 pt-4">
          <span className="t-strong">{current ? `Phase ${current.name.toLowerCase()}` : "Ton plan"}</span>
          <WeekBar program={program} />
          {note && <span className="t-sub">{note}</span>}
        </div>
      )}
      <Button onClick={() => show({ kind: "goal" })}>Modifier l'objectif</Button>
    </Surface>
  );
}
