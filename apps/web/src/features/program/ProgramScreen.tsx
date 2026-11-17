import { useEffect } from "react";
import { LoadFailed } from "../../ui/EmptyState.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { usePlan } from "../plan/store.ts";
import { GoalCard } from "./GoalCard.tsx";
import { PlanPhases } from "./PlanPhases.tsx";
import { ProgramSettings } from "./ProgramSettings.tsx";

/** Programme et réglages (design/Programme). */
export default function ProgramScreen() {
  const program = usePlan((s) => s.program);
  const today = usePlan((s) => s.today?.date);
  const status = usePlan((s) => s.programStatus);
  useEffect(() => {
    void usePlan.getState().loadProgram();
  }, []);
  return (
    <Screen>
      <h1 className="sr-only-label">Programme</h1>
      {!program && status === "error" && (
        <LoadFailed
          title="Programme indisponible"
          what="ton programme"
          onRetry={() => void usePlan.getState().loadProgram()}
        />
      )}
      {!program && status !== "error" && <Skeleton label="Chargement de ton programme" />}
      {program && today && <GoalCard program={program} today={today} />}
      {program && <PlanPhases program={program} />}
      {program && <ProgramSettings program={program} />}
    </Screen>
  );
}
