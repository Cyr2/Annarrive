import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useSignedOut } from "./api/session.ts";
import { SignedOut } from "./features/auth/SignedOut.tsx";
import { needsOnboarding } from "./features/onboarding/done.ts";
import { usePlan } from "./features/plan/store.ts";
import { skyPhase } from "./features/program/sky.ts";
import { usePush } from "./features/push/store.ts";
import { SheetHost } from "./features/sheets/SheetHost.tsx";
import { TodayScreen } from "./features/today/TodayScreen.tsx";
import { type Tab, TabBar } from "./ui/controls.tsx";
import { Sky } from "./ui/Sky.tsx";
import { ToastHost } from "./ui/ToastHost.tsx";

// The first screen ships in the initial file; the other tabs load on demand (or when a finger lands on their tab).
const loadWeek = () => import("./features/week/WeekScreen.tsx");
const loadProgram = () => import("./features/program/ProgramScreen.tsx");
const loadReggie = () => import("./features/reggie/ReggieScreen.tsx");
const WeekScreen = lazy(loadWeek);
const ProgramScreen = lazy(loadProgram);
const ReggieScreen = lazy(loadReggie);
// Onboarding is its own chunk, fetched only when the server says it is not done.
const OnboardingGate = lazy(() => import("./features/onboarding/OnboardingGate.tsx"));

const TABS: Tab[] = [
  { href: "/", label: "Aujourd'hui", icon: "today" },
  { href: "/semaine", label: "Semaine", icon: "week", preload: loadWeek },
  { href: "/programme", label: "Programme", icon: "flag", preload: loadProgram },
  { href: "/reggie", label: "Reggie", icon: "reggie", preload: loadReggie },
];

export function App() {
  const [location, navigate] = useLocation();
  const active = TABS.some((tab) => tab.href === location) ? location : null;
  // The first screen paints at once (it is the LCP); every screen after it fades in.
  const first = useRef<string | null>(location);
  if (location !== first.current) first.current = null;

  const signedOut = useSignedOut((s) => s.signedOut);
  const phase = usePlan((s) => skyPhase(s.program, s.today?.date));
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    // Aujourd'hui first: nothing else competes with its requests or delays its paint.
    void usePlan
      .getState()
      .load()
      .then(() => {
        void usePush.getState().check();
        void needsOnboarding().then(setOnboarding);
      });
  }, []);

  if (signedOut)
    return (
      <>
        <Sky />
        <SignedOut />
      </>
    );

  return (
    <>
      <Sky phase={phase} />
      <div key={location} className={first.current ? undefined : "screen-in"}>
        <Suspense fallback={null}>
          <Switch>
            <Route path="/" component={TodayScreen} />
            <Route path="/semaine" component={WeekScreen} />
            <Route path="/programme" component={ProgramScreen} />
            <Route path="/reggie" component={ReggieScreen} />
            <Route>
              <Redirect to="/" />
            </Route>
          </Switch>
        </Suspense>
      </div>
      <TabBar tabs={TABS} active={active} onNavigate={navigate} />
      <SheetHost />
      <ToastHost />
      {onboarding && (
        <Suspense fallback={null}>
          <OnboardingGate />
        </Suspense>
      )}
    </>
  );
}
