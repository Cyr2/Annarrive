import { lazy, Suspense, useEffect } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { isOnboarded } from "./features/onboarding/done.ts";
import { usePlan } from "./features/plan/store.ts";
import { SheetHost } from "./features/sheets/SheetHost.tsx";
import { TodayScreen } from "./features/today/TodayScreen.tsx";
import { withTransition } from "./lib/transition.ts";
import { type Tab, TabBar } from "./ui/TabBar.tsx";
import { ToastHost } from "./ui/ToastHost.tsx";

// The first screen ships in the initial file; the other tabs load on demand (or when a finger lands on their tab).
const loadWeek = () => import("./features/week/WeekScreen.tsx");
const loadProgram = () => import("./features/program/ProgramScreen.tsx");
const loadReggie = () => import("./features/reggie/ReggieScreen.tsx");
const WeekScreen = lazy(loadWeek);
const ProgramScreen = lazy(loadProgram);
const ReggieScreen = lazy(loadReggie);
// Onboarding is its own chunk, fetched only until it is done once.
const OnboardingGate = lazy(() => import("./features/onboarding/OnboardingGate.tsx"));
const onboarded = isOnboarded();

const TABS: Tab[] = [
  { href: "/", label: "Aujourd'hui", icon: "today" },
  { href: "/semaine", label: "Semaine", icon: "week", preload: loadWeek },
  { href: "/programme", label: "Programme", icon: "flag", preload: loadProgram },
  { href: "/reggie", label: "Reggie", icon: "reggie", preload: loadReggie },
];

export function App() {
  const [location, navigate] = useLocation();
  const active = TABS.findIndex((tab) => tab.href === location);

  useEffect(() => {
    void usePlan.getState().load();
  }, []);

  return (
    <>
      <div data-vaul-drawer-wrapper="" className="min-h-dvh bg-bg">
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
        <TabBar tabs={TABS} active={active} onNavigate={(href) => withTransition(() => navigate(href))} />
      </div>
      <SheetHost />
      <ToastHost />
      {!onboarded && (
        <Suspense fallback={null}>
          <OnboardingGate />
        </Suspense>
      )}
    </>
  );
}
