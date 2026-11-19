import type { ReactNode } from "react";
import { cx } from "../../lib/cx.ts";
import { ChoiceCard } from "../../ui/ChoiceCard.tsx";
import { DayChips, toggled } from "../../ui/DayChips.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { type Draft, questionSteps, type Step } from "./onboarding.ts";
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
  /** A narrow tile of a grid: the check sits in its corner. */
  tile?: boolean;
};

/** A big answer: the whole row is the target, a choice card. */
export function BigChoice({ on, onClick, label, detail, className, tile }: ChoiceProps) {
  return (
    <ChoiceCard on={on} onClick={onClick} layout={tile ? "tile" : "row"} className={cx("w-full", className)}>
      <span className="flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
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

/** A card holding one block of a step. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <Surface className={cx("flex flex-col gap-3 p-4", className)}>{children}</Surface>;
}

/** Progress: one short segment per step she answers, filled in the action blue up to the current one. */
export function Progress({ step }: { step: Step }) {
  const steps = questionSteps(useDraft());
  const at = steps.indexOf(step);
  return (
    <div
      role="img"
      aria-label={`Étape ${at + 1} sur ${steps.length}`}
      className="flex flex-1 justify-center gap-1.5 px-4"
    >
      {steps.map((s, i) => (
        <span
          key={s}
          className={cx("select-anim h-1.5 max-w-10 flex-1 rounded-full", i <= at ? "bg-action" : "bg-hairline-strong")}
        />
      ))}
    </div>
  );
}
