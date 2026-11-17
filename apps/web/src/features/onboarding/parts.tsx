import type { ReactNode } from "react";
import { cx } from "../../lib/cx.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Chip } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { type Draft, STEPS, type Step } from "./onboarding.ts";
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
  /** The check mark, left out on narrow tiles where the ring says enough. */
  mark?: boolean;
};

/** A big answer: the whole row is the target, selected with the action ring and a check. */
export function BigChoice({ on, onClick, label, detail, className, mark = true }: ChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      data-variant="inset"
      className={cx(
        "surface select-anim press flex min-h-14 w-full min-w-0 items-center gap-3 border-0 px-4 py-3 text-left text-ink",
        on && "bg-action-wash shadow-ring",
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col [overflow-wrap:anywhere]">
        <span className="t-strong">{label}</span>
        {detail && <span className="t-cap">{detail}</span>}
      </span>
      {mark && <Icon name="check" size={18} stroke={2.6} className={cx("flex-none text-action", !on && "opacity-0")} />}
    </button>
  );
}

const DAYS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];

/** The seven days as chips ("Lun", "Mar"...), 1 = Monday as in the profile. */
export function DayChips({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number[];
  onChange: (v: number[]) => void;
}) {
  return (
    // Wraps on a 320 px screen rather than shrinking under 44 px.
    <ChoiceGroup label={label} className="flex flex-wrap gap-2">
      {DAYS.map((name, i) => {
        const day = i + 1;
        const on = value.includes(day);
        return (
          <Chip
            key={name}
            selected={on}
            aria-label={name}
            onClick={() => onChange(on ? value.filter((d) => d !== day) : [...value, day])}
          >
            {name.charAt(0).toUpperCase() + name.slice(1, 3)}
          </Chip>
        );
      })}
    </ChoiceGroup>
  );
}

/** A card holding one block of a step. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <Surface className={cx("flex flex-col gap-3 p-4", className)}>{children}</Surface>;
}

/** Progress: a thin bar in the action blue, filling step by step. */
export function Dots({ step }: { step: Step }) {
  const at = STEPS.indexOf(step);
  return (
    <div role="img" aria-label={`Étape ${at + 1} sur ${STEPS.length}`} className="flex flex-1 justify-center px-4">
      <span className="h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-hairline-strong">
        <span
          className="tab-pill block h-full rounded-full bg-action"
          style={{ width: `${((at + 1) / STEPS.length) * 100}%` }}
        />
      </span>
    </div>
  );
}
