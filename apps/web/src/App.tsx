import { Suspense, useCallback, useEffect, useRef } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { useSignedOut } from "./api/session.ts";
import { SignedOut } from "./features/auth/SignedOut.tsx";
import { OfflineLine } from "./features/OfflineLine.tsx";
import { checkOnboarding, useOnboardingNeed } from "./features/onboarding/done.ts";
import { isStale, usePlan } from "./features/plan/store.ts";
import { skyPhase } from "./features/program/sky.ts";
import { usePush } from "./features/push/store.ts";
import { preloadSheet, SheetHost } from "./features/sheets/SheetHost.tsx";
import type { SheetSpec } from "./features/sheets/store.ts";
import { TodayScreen } from "./features/today/TodayScreen.tsx";
import { watchForUpdates } from "./features/updates.ts";
import { ChunkBoundary, lazyChunk } from "./ui/ChunkBoundary.tsx";
import { preloadControls, type Tab, TabBar } from "./ui/controls.tsx";
import { LoadFailed } from "./ui/EmptyState.tsx";
import { Screen } from "./ui/Screen.tsx";
import { Skeleton } from "./ui/Skeleton.tsx";
import { Sky } from "./ui/Sky.tsx";
import { loadToast, ToastHost } from "./ui/ToastHost.tsx";

// The first screen ships in the initial file; the other tabs load at idle (or when a finger lands on their tab).
const WeekScreen = lazyChunk(() => import("./features/week/WeekScreen.tsx"));
const ProgramScreen = lazyChunk(() => import("./features/program/ProgramScreen.tsx"));
const ReggieScreen = lazyChunk(() => import("./features/reggie/ReggieScreen.tsx"));
// Onboarding is its own chunk, fetched only when the server says it is not done.
const OnboardingGate = lazyChunk(() => import("./features/onboarding/OnboardingGate.tsx"));
// Seen once per device, after its first login.
const FaceIdOffer = lazyChunk(() => import("./features/auth/FaceIdOffer.tsx"));

const TABS: Tab[] = [
  { href: "/", label: "Aujourd'hui", icon: "today" },
  { href: "/semaine", label: "Semaine", icon: "week", preload: WeekScreen.preload },
  { href: "/programme", label: "Programme", icon: "flag", preload: ProgramScreen.preload },
  { href: "/reggie", label: "Reggie", icon: "reggie", preload: ReggieScreen.preload },
];

const SHEETS: SheetSpec["kind"][] = [
  "move",
  "change",
  "unavailable",
  "session",
  "event",
  "add",
  "strength",
  "setting",
  "goal",
  "watch",
  "cycle",
  "stop",
];

/** After the first screen's render has settled. Safari has no requestIdleCallback: a timeout stands in. */
function whenIdle(task: () => void) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(task, { timeout: 2000 });
  else setTimeout(task, 500);
}

const PRELOAD_DELAY_MS = 800;

/** Everything a first tap would otherwise wait for: the other tabs, the sheets (with motion), the banner, glisse. */
function preloadAll() {
  void usePlan.getState().loadProgram();
  for (const screen of [WeekScreen, ProgramScreen, ReggieScreen]) screen.preload();
  loadToast().catch(() => undefined);
  for (const kind of SHEETS) preloadSheet(kind);
  preloadControls();
}

/** Back to the screen, or a new day while it is open: the plan is read again if it may have changed. */
function freshen() {
  if (document.visibilityState === "visible" && isStale(usePlan.getState(), new Date())) {
    void usePlan.getState().refresh();
  }
}

function useFreshPlan() {
  useEffect(() => {
    const events = ["pageshow", "focus", "online"] as const;
    document.addEventListener("visibilitychange", freshen);
    for (const type of events) addEventListener(type, freshen);
    let timer: ReturnType<typeof setTimeout>;
    const atMidnight = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = setTimeout(() => {
        freshen();
        atMidnight();
      }, next.getTime() - now.getTime());
    };
    atMidnight();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", freshen);
      for (const type of events) removeEventListener(type, freshen);
    };
  }, []);
}

/** A screen whose file did not load: the rest of the app stays, with Réessayer. */
const screenFailed = (retry: () => void) => (
  <Screen>
    <LoadFailed title="Écran indisponible" what="cet écran" onRetry={retry} />
  </Screen>
);

export function App() {
  const [location, navigate] = useLocation();
  const active = TABS.some((tab) => tab.href === location) ? location : null;
  // The first screen paints at once (it is the LCP); every screen after it fades in.
  const first = useRef<string | null>(location);
  if (location !== first.current) first.current = null;

  const signedOut = useSignedOut((s) => s.signedOut);
  const phase = usePlan((s) => skyPhase(s.program, s.today?.date));
  const goHome = useCallback(() => navigate("/"), [navigate]);
  // WebKit hands glisse's tab bar two clicks for one tap: the second must not stack a second entry for Back.
  const toTab = (href: string) => href !== window.location.pathname + window.location.search && navigate(href);
  // Once asked for, the gate stays mounted after the flow: the tour follows it over Aujourd'hui.
  const gate = useRef(false);
  if (useOnboardingNeed((s) => s.need)) gate.current = true;

  useEffect(() => {
    checkOnboarding();
    // Aujourd'hui first: nothing else competes with its requests or delays its paint, then the rest waits for idle.
    void usePlan
      .getState()
      .load()
      .then(() =>
        whenIdle(() => {
          void usePush.getState().check();
          import("virtual:pwa-register").then(
            ({ registerSW }) => watchForUpdates(registerSW),
            () => undefined,
          );
          // Well after the first paint, so it never competes with it: a tap before then preloads what it opens.
          setTimeout(() => whenIdle(preloadAll), PRELOAD_DELAY_MS);
        }),
      );
  }, []);
  useFreshPlan();

  if (signedOut)
    return (
      <>
        <Sky />
        <SignedOut />
      </>
    );

  if (location === "/face-id")
    return (
      <>
        <Sky />
        <ChunkBoundary fallback={screenFailed}>
          <Suspense fallback={null}>
            <FaceIdOffer onDone={goHome} />
          </Suspense>
        </ChunkBoundary>
      </>
    );

  return (
    <>
      <Sky phase={phase} />
      <OfflineLine />
      <div key={location} className={first.current ? undefined : "screen-in"}>
        <ChunkBoundary fallback={screenFailed}>
          <Suspense
            fallback={
              <Screen>
                <Skeleton label="Chargement de l'écran" />
              </Screen>
            }
          >
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
        </ChunkBoundary>
      </div>
      <TabBar tabs={TABS} active={active} onNavigate={toTab} />
      <SheetHost />
      <ToastHost />
      {gate.current && (
        <ChunkBoundary fallback={() => null} onError={() => useOnboardingNeed.setState({ need: false })}>
          <Suspense fallback={null}>
            <OnboardingGate />
          </Suspense>
        </ChunkBoundary>
      )}
    </>
  );
}
