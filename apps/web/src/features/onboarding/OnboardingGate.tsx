import { useEffect } from "react";
import { useLocation } from "wouter";
import { usePlan } from "../plan/store.ts";
import { useOnboardingNeed } from "./done.ts";
import { OnboardingFlow } from "./OnboardingFlow.tsx";
import { useOnboarding } from "./store.ts";

/** Asks the server whether onboarding is done; shows the questions, then her first week, then Aujourd'hui. */
export default function OnboardingGate() {
  const phase = useOnboarding((s) => s.phase);
  const [, navigate] = useLocation();

  useEffect(() => {
    void useOnboarding.getState().start();
  }, []);

  if (phase !== "flow") return null;
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
