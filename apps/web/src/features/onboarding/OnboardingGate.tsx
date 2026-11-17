import { useEffect } from "react";
import { useLocation } from "wouter";
import { usePlan } from "../plan/store.ts";
import { useOnboardingNeed } from "./done.ts";
import { OnboardingFlow } from "./OnboardingFlow.tsx";
import { useOnboarding } from "./store.ts";
import { Tour } from "./Tour.tsx";

/** Asks the server whether onboarding is done; shows the questions, then the tour over Aujourd'hui. */
export default function OnboardingGate() {
  const phase = useOnboarding((s) => s.phase);
  const [, navigate] = useLocation();

  useEffect(() => {
    void useOnboarding.getState().start();
  }, []);

  if (phase === "flow") {
    return (
      <OnboardingFlow
        onDone={() => {
          navigate("/");
          useOnboardingNeed.setState({ need: false });
          void usePlan.getState().load();
        }}
      />
    );
  }
  if (phase === "tour") return <Tour onEnd={useOnboarding.getState().endTour} />;
  return null;
}
