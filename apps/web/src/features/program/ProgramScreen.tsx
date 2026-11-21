import { useEffect } from "react";
import { useLocation } from "wouter";
import { IconButton } from "../../ui/controls.tsx";
import { LoadFailed } from "../../ui/EmptyState.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { usePlan } from "../plan/store.ts";
import { GoalCard } from "./GoalCard.tsx";
import { Level } from "./Level.tsx";
import { PlanPhases } from "./PlanPhases.tsx";
import { PUSHED, SETTINGS_PATH } from "./settingsPath.ts";

/** Programme: the goal, the phases and her level. The settings live one page further, behind the gear. */
export default function ProgramScreen() {
  const program = usePlan((s) => s.program);
  const today = usePlan((s) => s.today?.date);
  const status = usePlan((s) => s.programStatus);
  const [, navigate] = useLocation();
  useEffect(() => {
    void usePlan.getState().loadProgram();
  }, []);
  return (
    <Screen>
      <h1 className="sr-only-label">Programme</h1>
      {/* The gear's own row, so the goal card below it never moves while the programme loads. */}
      <div className="-mb-3 flex justify-end">
        <IconButton
          icon="settings"
          label="Réglages"
          // Pushed with its origin: « ‹ Programme » and Back then pop it, as on iOS.
          onClick={() => navigate(SETTINGS_PATH, { state: PUSHED })}
        />
      </div>
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
      {program && today && <Level program={program} today={today} />}
    </Screen>
  );
}
