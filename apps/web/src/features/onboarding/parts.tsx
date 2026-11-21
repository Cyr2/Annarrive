import { type ReactNode, useId } from "react";
import { cx } from "../../lib/cx.ts";
import { ChoiceCard } from "../../ui/ChoiceCard.tsx";
import { DayChips, toggled } from "../../ui/DayChips.tsx";
import { type Draft, QUESTIONS, type Step } from "./onboarding.ts";
import { useOnboarding } from "./store.ts";

/** Small pieces shared by the onboarding steps. */

export const useDraft = () => useOnboarding((s) => s.draft);
export const update = (patch: Partial<Draft>) => useOnboarding.getState().update(patch);

type ChoiceProps = {
  on: boolean;
  onClick: () => void;
  label: ReactNode;
  detail?: string;
  className?: string;
};

/** A big answer: the whole row is the target, a choice card. */
export function BigChoice({ on, onClick, label, detail, className }: ChoiceProps) {
  return (
    <ChoiceCard on={on} onClick={onClick} className={cx("w-full", className)}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="t-strong">{label}</span>
        {detail && <span className="t-cap">{detail}</span>}
      </span>
    </ChoiceCard>
  );
}

/** The app's day chips over the profile's days, where 1 = Monday. */
export function ProfileDays({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    <DayChips label={label} selected={value.map((d) => d - 1)} onToggle={(day) => onChange(toggled(value, day + 1))} />
  );
}

/** What an answer changes, in a line or two. */
export function Help({ children }: { children: ReactNode }) {
  return <p className="t-cap m-0 px-4">{children}</p>;
}

type AskProps = { question: string; help?: ReactNode; children: ReactNode };

/** One question of a screen with its answer and what it changes; the answer's choices are named by the question. */
export function Ask({ question, help, children }: AskProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="t-strong m-0 px-1">
        {question}
      </h2>
      {children}
      {help && <Help>{help}</Help>}
    </section>
  );
}

/** Progress: a dot per question, the current one stretched, those behind her tinted. */
export function Progress({ step }: { step: Step }) {
  const at = QUESTIONS.indexOf(step);
  return (
    <div
      role="img"
      aria-label={`Question ${at + 1} sur ${QUESTIONS.length}`}
      className="flex flex-1 items-center justify-center gap-1.5"
    >
      {QUESTIONS.map((s, i) => (
        <span
          key={s}
          className={cx(
            "select-anim h-1.75 rounded-full",
            i === at ? "w-5.5 bg-action" : "w-1.75",
            i < at ? "bg-action/45" : i > at && "bg-hairline-strong",
          )}
        />
      ))}
    </div>
  );
}
