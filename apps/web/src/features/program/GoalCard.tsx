import type { Program } from "../../api/schemas.ts";
import { daysBetween, longDate } from "../../lib/date.ts";
import { Button } from "../../ui/controls.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { useSheet } from "../sheets/store.ts";
import { ToneWash } from "../today/parts.tsx";
import { raceTitle } from "./goal.ts";
import { raceClock, secondsOf } from "./program.ts";
import { TargetTag } from "./TargetTag.tsx";

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function Maintenance() {
  const show = useSheet((s) => s.show);
  return (
    <Surface as="article" className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-1">
        <span className="t-cap">Sans objectif</span>
        <h2 className="t-large m-0">Mode entretien</h2>
        <span className="t-sub">2 à 3 courses faciles par semaine, dont une un peu plus rythmée.</span>
      </div>
      <Button variant="tinted" onClick={() => show({ kind: "goal" })}>
        Choisir un objectif
      </Button>
    </Surface>
  );
}

/** The goal at a glance: the day, the race, where she is in the weeks, her own target and how it looks. */
export function GoalCard({ program, today }: { program: Program; today: string }) {
  const show = useSheet((s) => s.show);
  if (program.maintenance) return <Maintenance />;
  const { goal } = program;
  // The phase is named once, by the frieze below (PlanPhases): here only where she is in the weeks.
  const week = program.weekTotal ? `Semaine ${program.weekIndex} sur ${program.weekTotal}` : "";
  return (
    <Surface as="article" aria-label="Ton objectif" className="relative flex flex-col overflow-hidden p-5">
      <ToneWash tone="long" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="t-sub">{capitalize(longDate(goal.date))}</span>
        <TextButton
          className="-my-3 -mr-1"
          aria-label={daysBetween(today, goal.date) < 0 ? "Choisir un nouvel objectif" : "Modifier l'objectif"}
          onClick={() => show({ kind: "goal" })}
        >
          {daysBetween(today, goal.date) < 0 ? "Nouvel objectif" : "Modifier"}
        </TextButton>
      </div>
      <h2 className="t-large relative m-0 mt-1">{raceTitle(goal)}</h2>
      {week && <span className="t-body relative text-ink-2 tabular-nums">{week}</span>}
      <div className="hairline-top relative mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 pt-4">
        <div className="flex flex-col">
          <span className="t-sub">{goal.targetTime ? "Chrono visé" : "Objectif"}</span>
          <PaceValue value={goal.targetTime ? raceClock(secondsOf(goal.targetTime)) : "Finir"} size="figure" />
        </div>
        {goal.targetTag && <TargetTag kind={goal.targetTag} why={goal.targetWhy} />}
      </div>
    </Surface>
  );
}
