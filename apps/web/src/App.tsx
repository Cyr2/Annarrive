import { Suspense, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { crumb } from "./api/journal.ts";
import { useSignedOut } from "./api/session.ts";
import { SignedOut } from "./features/auth/SignedOut.tsx";
import { OfflineLine } from "./features/OfflineLine.tsx";
import { checkOnboarding, useOnboardingNeed } from "./features/onboarding/done.ts";
import { isStale, usePlan } from "./features/plan/store.ts";
import { skyPhase } from "./features/program/sky.ts";
import { usePush } from "./features/push/store.ts";
import { preloadSheet, SheetHost } from "./features/sheets/SheetHost.tsx";
import { type SheetSpec, useSheet } from "./features/sheets/store.ts";
import { backToTabRoot } from "./features/tabRoot.ts";
import { TodayScreen } from "./features/today/TodayScreen.tsx";
import { watchForUpdates } from "./features/updates.ts";
import { swipes, useTabSwipe } from "./features/useTabSwipe.ts";
import { cx } from "./lib/cx.ts";
import { whenIdle } from "./lib/idle.ts";
import { reducedMotion } from "./lib/motion.ts";
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
  "timetable",
  "target",
];

const PRELOAD_DELAY_MS = 800;

/** Everything a first tap would otherwise wait for: the other tabs, the sheets (with motion), the banner, glisse. */
const PRELOADS: (() => void)[] = [
  () => void usePlan.getState().loadProgram(),
  ...[WeekScreen, ProgramScreen, ReggieScreen].map((screen) => screen.preload),
  () => loadToast().catch(() => undefined),
  ...SHEETS.map((kind) => () => preloadSheet(kind)),
  preloadControls,
];

/** One preload per idle moment: all at once held the main thread for a long task. */
function preloadAll(steps = PRELOADS) {
  const [step, ...rest] = steps;
  step?.();
  if (rest.length > 0) whenIdle(() => preloadAll(rest));
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

/** Another screen starts at its top, as a native tab does; Back alone finds a page where the browser left it. */
function useTopOnNavigate(location: string) {
  const popped = useRef<string | null>(null);
  useEffect(() => {
    const onPop = () => {
      popped.current = window.location.pathname;
    };
    addEventListener("popstate", onPop);
    return () => removeEventListener("popstate", onPop);
  }, []);
  useLayoutEffect(() => {
    if (popped.current !== location) scrollTo(0, 0);
    popped.current = null;
  }, [location]);
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
  // The tab on screen touched again goes back to its root (features/tabRoot.ts). WebKit hands glisse's tab bar two
  // clicks for one tap: the second lands here too, on a screen already at its root, and stacks no entry for Back.
  const toTab = (href: string) => {
    if (href !== window.location.pathname) return navigate(href);
    if (window.location.search) navigate(href, { replace: true });
    if (backToTabRoot())
      requestAnimationFrame(() => scrollTo({ top: 0, behavior: reducedMotion() ? "instant" : "smooth" }));
  };
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
          setTimeout(() => whenIdle(() => preloadAll()), PRELOAD_DELAY_MS);
        }),
      );
  }, []);
  useFreshPlan();
  useTopOnNavigate(location);
  const swipe = useTabSwipe(location, toTab);
  // The journal's breadcrumbs: which screen, which sheet (api/journal.ts).
  useEffect(() => crumb("route", location), [location]);
  useEffect(
    () =>
      useSheet.subscribe((s, before) => {
        if (s.current !== before.current) crumb("sheet", s.current?.kind ?? "fermée");
      }),
    [],
  );

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
      {/* A screen sliding in or out stays inside the width: off to the side, it would make the page scroll sideways,
          and a scroll into view (Reggie's last message) would then shift the whole screen. */}
      <div className="overflow-x-clip">
        <div
          key={location}
          ref={swipe}
          className={cx(!first.current && "screen-in", swipes(location) && "touch-pan-y touch-pinch-zoom")}
        >
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
