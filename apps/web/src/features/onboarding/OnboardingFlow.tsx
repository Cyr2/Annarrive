import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "../../lib/cx.ts";
import { SPRING_STEP } from "../../lib/motion.ts";
import { Button, IconButton } from "../../ui/controls.tsx";
import { LogoSlot } from "../../ui/LogoSlot.tsx";
import { Sky } from "../../ui/Sky.tsx";
import { ReadyStep, WelcomeStep } from "./Bookends.tsx";
import { ConsentStep } from "./CareSteps.tsx";
import { COPY, issue, type Step } from "./onboarding.ts";
import { Progress } from "./parts.tsx";
import { LastStep, RaceStep } from "./RaceSteps.tsx";
import { DaysStep, WeekStep } from "./RoutineSteps.tsx";
import { useOnboarding } from "./store.ts";

const BODIES: Record<Step, () => ReactNode> = {
  welcome: WelcomeStep,
  race: RaceStep,
  last: LastStep,
  week: WeekStep,
  days: DaysStep,
  consent: ConsentStep,
  ready: ReadyStep,
};

/** The main button says what it does. */
function primaryLabel(step: Step, sending: boolean): string {
  if (sending) return "Préparation de ta semaine";
  if (step === "welcome") return "Commencer";
  if (step === "consent") return "Préparer ma semaine";
  if (step === "ready") return "Voir aujourd'hui";
  return "Continuer";
}

/** Before the first question and once her week is built, there is nothing to go back to. */
const bare = (step: Step) => step === "welcome" || step === "ready";

// The new screen comes from the side she is heading to; under reduced motion MotionConfig keeps only the fade.
const slide = {
  enter: (d: number) => ({ x: `${d * 100}%`, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: `${d * -30}%`, opacity: 0 }),
};

// A long step fades out above the button instead of being cut flat (a mask: only its alpha counts).
const FADE_BOTTOM = "linear-gradient(to bottom, #000 calc(100% - 24px), transparent)";

function Title({ step }: { step: Step }) {
  const title = useRef<HTMLHeadingElement>(null);
  // VoiceOver starts each screen on its question.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocuses on each new step
  useEffect(() => title.current?.focus({ preventScroll: true }), [step]);
  const welcome = step === "welcome";
  return (
    <div
      className={cx(
        "flex flex-col gap-2",
        welcome && "items-center pt-[8vh] pb-2 text-center",
        step === "ready" && "pt-6",
      )}
    >
      {welcome && <LogoSlot size={96} className="mb-3" />}
      <h1
        ref={title}
        id="onboarding-title"
        tabIndex={-1}
        className={cx(welcome ? "t-figure" : "t-large", "m-0 outline-none")}
      >
        {COPY[step].title}
      </h1>
      {COPY[step].lead && (
        <p className={cx("m-0", welcome ? "t-body max-w-xs text-ink-2" : "t-sub")}>{COPY[step].lead}</p>
      )}
    </div>
  );
}

const onboardingEntry = () => {
  const state: unknown = history.state;
  return typeof state === "object" && state !== null && "onboarding" in state;
};

/**
 * The system's Back (Android, the iPhone's edge swipe) steps back through the questions as the Retour arrow does,
 * instead of leaving the app: one history entry stands in front of the flow, put back after each step back.
 */
function useSystemBack(step: Step, back: () => void) {
  useEffect(() => {
    if (bare(step)) return;
    if (!onboardingEntry()) history.pushState({ onboarding: true }, "");
    addEventListener("popstate", back);
    return () => removeEventListener("popstate", back);
  }, [step, back]);
}

/** One question per screen, full screen over the app (no tab bar), sliding with a spring. */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const { step, direction, draft, today, sending, error } = useOnboarding();
  const { next, back, submit, skipLast, finish } = useOnboarding.getState();
  const blocked = issue(step, draft, today);
  const Body = BODIES[step];

  // A second tap while the next screen slides in would answer a question she has not seen yet.
  const [moving, setMoving] = useState(false);
  const go = (move: () => unknown) => {
    if (moving) return;
    setMoving(true);
    move();
  };
  const primary = () => {
    if (step === "ready") {
      finish();
      return onDone();
    }
    // A send that fails stays on this screen: `sending`, not the slide, holds its button.
    if (step === "consent") return void submit();
    go(next);
  };
  useSystemBack(step, back);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex flex-col"
    >
      <Sky />
      <header
        className={cx("relative mx-auto flex w-full max-w-xl items-center gap-2 px-2", bare(step) && "invisible")}
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <IconButton icon="chevronLeft" label="Retour" onClick={back} />
        {!bare(step) && <Progress step={step} />}
        <span className="size-11 flex-none" />
      </header>
      <MotionConfig reducedMotion="user">
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence initial={false} custom={direction} onExitComplete={() => setMoving(false)}>
            <motion.section
              key={step}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={SPRING_STEP}
              className="absolute inset-0 scroll-pb-8 overflow-y-auto overscroll-contain"
              style={{ maskImage: FADE_BOTTOM, WebkitMaskImage: FADE_BOTTOM }}
            >
              <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 pt-3 pb-8">
                <Title step={step} />
                <Body />
              </div>
            </motion.section>
          </AnimatePresence>
        </div>
      </MotionConfig>
      <footer
        className="relative mx-auto flex w-full max-w-xl flex-col gap-2 px-4 pt-2"
        style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}
      >
        <p aria-live="polite" className={cx("t-cap m-0 min-h-4.5 text-center", error && "text-warn-deep")}>
          {step === "welcome" ? "" : (blocked ?? error ?? "")}
        </p>
        {/* Each button as wide as its words needs, so « Je n'en ai pas » holds on one line at 320 px. */}
        <div className="flex gap-2.5 *:flex-auto *:whitespace-nowrap">
          {step === "last" && (
            <Button size="large" aria-disabled={moving || undefined} onClick={() => go(skipLast)}>
              Je n'en ai pas
            </Button>
          )}
          <Button
            variant="filled"
            size="large"
            disabled={Boolean(blocked) || sending}
            aria-disabled={moving || undefined}
            onClick={primary}
          >
            {primaryLabel(step, sending)}
          </Button>
        </div>
      </footer>
    </div>
  );
}
