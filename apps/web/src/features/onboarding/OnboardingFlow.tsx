import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { cx } from "../../lib/cx.ts";
import { SPRING_STEP } from "../../lib/motion.ts";
import { Button, IconButton } from "../../ui/controls.tsx";
import { LogoSlot } from "../../ui/LogoSlot.tsx";
import { Sky } from "../../ui/Sky.tsx";
import { ConnectStep, HealthStep } from "./CareSteps.tsx";
import { COPY, type Draft, issue, type Step } from "./onboarding.ts";
import { Progress } from "./parts.tsx";
import { RaceStep, TargetStep } from "./RaceSteps.tsx";
import { HoursStep, StrengthStep, WeekStep } from "./RoutineSteps.tsx";
import { SummaryStep, WelcomeStep } from "./Summary.tsx";
import { useOnboarding } from "./store.ts";

const BODIES: Record<Step, () => ReactNode> = {
  welcome: WelcomeStep,
  race: RaceStep,
  target: TargetStep,
  week: WeekStep,
  hours: HoursStep,
  strength: StrengthStep,
  health: HealthStep,
  connect: ConnectStep,
  summary: SummaryStep,
};

/** The main button says what it does: an empty muscu step is skipped, not continued. */
function primaryLabel(step: Step, draft: Draft, sending: boolean): string {
  if (sending) return "Création de ton plan";
  if (step === "welcome") return "Commencer";
  if (step === "summary") return "C'est parti";
  if (step === "strength" && draft.strength.length === 0) return "Passer cette étape";
  return "Continuer";
}

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
    <div className={cx("flex flex-col gap-2", welcome && "items-center pt-[8vh] pb-2 text-center")}>
      {welcome && <LogoSlot size={96} className="mb-3" />}
      <h1
        ref={title}
        id="onboarding-title"
        tabIndex={-1}
        className={cx(welcome ? "t-figure" : "t-large", "m-0 outline-none")}
      >
        {COPY[step].title}
      </h1>
      <p className={cx("m-0", welcome ? "t-body max-w-xs text-ink-2" : "t-sub")}>{COPY[step].lead}</p>
    </div>
  );
}

/** A few grouped questions per screen, full screen over the app (no tab bar), sliding with a spring. */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const { step, direction, draft, today, sending } = useOnboarding();
  const { next, back, submit } = useOnboarding.getState();
  const blocked = issue(step, draft, today);
  const Body = BODIES[step];

  const primary = async () => {
    if (step !== "summary") return next();
    if (await submit()) onDone();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
      className="fixed inset-0 z-50 flex flex-col"
    >
      <Sky />
      <header
        className={cx(
          "relative mx-auto flex w-full max-w-xl items-center gap-2 px-2",
          step === "welcome" && "invisible",
        )}
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <IconButton icon="chevronLeft" label="Retour" onClick={back} />
        {step === "summary" ? <span className="flex-1" /> : <Progress step={step} />}
        <span className="size-11 flex-none" />
      </header>
      <MotionConfig reducedMotion="user">
        <div className="relative flex-1 overflow-hidden">
          <AnimatePresence initial={false} custom={direction}>
            <motion.section
              key={step}
              custom={direction}
              variants={slide}
              initial="enter"
              animate="center"
              exit="exit"
              transition={SPRING_STEP}
              className="absolute inset-0 overflow-y-auto overscroll-contain"
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
        <p aria-live="polite" className="t-cap m-0 min-h-4.5 text-center">
          {step === "welcome" ? "" : (blocked ?? "")}
        </p>
        <Button variant="filled" size="large" disabled={Boolean(blocked) || sending} onClick={() => void primary()}>
          {primaryLabel(step, draft, sending)}
        </Button>
      </footer>
    </div>
  );
}
