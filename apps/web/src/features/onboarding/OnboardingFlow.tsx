import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { type ReactNode, useEffect, useRef } from "react";
import { cx } from "../../lib/cx.ts";
import { SPRING_STEP } from "../../lib/motion.ts";
import { Button, IconButton } from "../../ui/controls.tsx";
import { LogoSlot } from "../../ui/LogoSlot.tsx";
import { Sky } from "../../ui/Sky.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { ConsentsStep, NotificationsStep, PainStep, TimetableStep } from "./CareSteps.tsx";
import { COPY, issue, type Step } from "./onboarding.ts";
import { Dots, update } from "./parts.tsx";
import { RaceStep, RunsStep, TargetStep } from "./RaceSteps.tsx";
import { BedtimeStep, LimitsStep, StrengthStep } from "./RoutineSteps.tsx";
import { SummaryStep, WelcomeStep } from "./Summary.tsx";
import { useOnboarding } from "./store.ts";

const BODIES: Record<Step, () => ReactNode> = {
  welcome: WelcomeStep,
  race: RaceStep,
  target: TargetStep,
  runs: RunsStep,
  bedtime: BedtimeStep,
  limits: LimitsStep,
  strength: StrengthStep,
  pain: PainStep,
  consents: ConsentsStep,
  timetable: TimetableStep,
  notifications: NotificationsStep,
  summary: SummaryStep,
};

const LABELS: Partial<Record<Step, string>> = { welcome: "Commencer", summary: "C'est parti" };

// The new screen comes from the side she is heading to; under reduced motion MotionConfig keeps only the fade.
const slide = {
  enter: (d: number) => ({ x: `${d * 100}%`, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: `${d * -30}%`, opacity: 0 }),
};

/** One question per screen, full screen over the app (no tab bar), sliding with a spring. */
export function OnboardingFlow({ onDone }: { onDone: () => void }) {
  const { step, direction, draft, today, sending } = useOnboarding();
  const { next, back, submit } = useOnboarding.getState();
  const title = useRef<HTMLHeadingElement>(null);
  const blocked = issue(step, draft, today);
  const Body = BODIES[step];

  // VoiceOver starts each screen on its question.
  // biome-ignore lint/correctness/useExhaustiveDependencies: refocuses on each new step
  useEffect(() => title.current?.focus({ preventScroll: true }), [step]);

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
        className="relative mx-auto flex w-full max-w-xl items-center gap-2 px-2"
        style={{ paddingTop: "max(12px, env(safe-area-inset-top))" }}
      >
        <IconButton
          icon="chevronLeft"
          label="Retour"
          onClick={back}
          className={cx(step === "welcome" && "invisible")}
        />
        <Dots step={step} />
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
            >
              <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 pt-4 pb-6">
                <div className={cx("flex flex-col gap-2", step === "welcome" && "items-start pt-[14vh]")}>
                  {step === "welcome" && <LogoSlot size={88} className="mb-4" />}
                  <h1 ref={title} id="onboarding-title" tabIndex={-1} className="t-large outline-none">
                    {COPY[step].title}
                  </h1>
                  <p className="t-sub m-0">{COPY[step].lead}</p>
                </div>
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
          {sending ? "Création de ton plan" : (LABELS[step] ?? "Continuer")}
        </Button>
        {step === "strength" && (
          <TextButton
            className="self-center"
            onClick={() => {
              update({ strength: [] });
              next();
            }}
          >
            Plus tard
          </TextButton>
        )}
      </footer>
    </div>
  );
}
