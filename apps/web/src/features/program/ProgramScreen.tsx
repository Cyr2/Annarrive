import { useEffect } from "react";
import { useLocation } from "wouter";
import { LoadFailed } from "../../ui/EmptyState.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { LevelCard } from "../level/LevelCard.tsx";
import { usePlan } from "../plan/store.ts";
import { ProgressionCard } from "../progression/ProgressionCard.tsx";
import { GoalCard } from "./GoalCard.tsx";
import { LastRace, SettingsRow } from "./Level.tsx";
import { PlanPhases } from "./PlanPhases.tsx";
import { PUSHED, SETTINGS_PATH } from "./settingsPath.ts";

/** Programme: the goal, the phases, her progression and her level. Réglages is its last row, one page further. */
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
      {program && <ProgressionCard />}
      {program && <LevelCard />}
      {program && today && <LastRace program={program} today={today} />}
      {/* Pushed with its origin: « ‹ Programme » and Back pop it, as on iOS. Reachable even if the programme fails. */}
      {(program || status === "error") && <SettingsRow onOpen={() => navigate(SETTINGS_PATH, { state: PUSHED })} />}
    </Screen>
  );
}
