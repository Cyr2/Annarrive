import { useEffect } from "react";
import { Screen } from "../../ui/Screen.tsx";
import { usePlan } from "../plan/store.ts";
import { GoalCard } from "./GoalCard.tsx";
import { PlanPhases } from "./PlanPhases.tsx";
import { ProgramSettings } from "./ProgramSettings.tsx";

/** Programme et réglages (design/Programme). */
export default function ProgramScreen() {
  const program = usePlan((s) => s.program);
  const today = usePlan((s) => s.today?.date);
  useEffect(() => {
    void usePlan.getState().loadProgram();
  }, []);
  return (
    <Screen>
      <h1 className="t-large">Programme</h1>
      {program && today && <GoalCard program={program} today={today} />}
      {program && <PlanPhases program={program} />}
      {program && <ProgramSettings program={program} />}
    </Screen>
  );
}
