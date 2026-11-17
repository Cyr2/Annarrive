import { useState } from "react";
import type { ChangeOption, ChangeOptionId } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, relativeMoment } from "../../lib/date.ts";
import { IconTile } from "../../ui/bits.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button } from "../../ui/controls.tsx";
import type { IconName } from "../../ui/Icon.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { AskReggie } from "../reggie/AskReggie.tsx";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { sessionContext } from "../today/today.ts";
import { changeOptions, usePreloaded } from "../useLoad.ts";

const ICONS: Record<ChangeOptionId, IconName> = { shorter: "clock", easier: "run", equivalent: "change", jog: "arc" };

/** Changer (design/Changer): keeps the moment, changes the content. Never harder than the plan. */
export default function ChangeSheet({ spec, ...sheet }: SheetProps<"change">) {
  const plan = usePlan();
  const run = findRun(plan, spec.id);
  const options = usePreloaded(changeOptions, spec.id);
  const [picked, setPicked] = useState<ChangeOptionId | undefined>();
  if (!run) return null;
  const today = todayOf(plan);
  const chosen = options?.find((o) => o.id === (picked ?? options[0]?.id));
  const validate = async () => {
    if (chosen && (await plan.apply((api) => api.change(run.id, chosen.id)))) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Changer la séance"
      footer={
        <Button variant="filled" size="large" disabled={!chosen} onClick={() => void validate()}>
          Valider{chosen ? ` : ${chosen.title.toLowerCase()}` : ""}
        </Button>
      }
    >
      <p className="t-cap m-0 px-4">
        Même moment, {relativeMoment(run.date, run.start, today).toLowerCase()}. Jamais plus dur que prévu.
      </p>
      {options === undefined && (
        // The four options' place, so the sheet rises once at its final height.
        <div className="grid grid-cols-2 gap-2">
          <Skeleton label="Chargement des options" className="h-30" />
          <Skeleton className="h-30" />
          <Skeleton className="h-30" />
          <Skeleton className="h-30" />
        </div>
      )}
      {options === null && (
        <p className="t-cap m-0 px-4">Impossible de charger les options. Réessaie dans un instant.</p>
      )}
      {options && (
        <ChoiceGroup label="Nouvelle séance" className="grid grid-cols-2 gap-2">
          {options.map((option) => (
            <OptionCard
              key={option.id}
              option={option}
              on={option.id === chosen?.id}
              onPick={() => setPicked(option.id)}
            />
          ))}
        </ChoiceGroup>
      )}
      {/* The chosen card already says what she gets: only what it replaces is added. */}
      {chosen && (
        <p className="t-cap m-0 px-4">
          Au lieu de <s>{[run.title, run.mainSet, duration(run.durationMin)].filter(Boolean).join(", ")}</s>
        </p>
      )}
      <AskReggie context={sessionContext(run, today)} sessionId={run.id} onSent={() => sheet.onOpenChange(false)} />
    </Sheet>
  );
}

function OptionCard({ option, on, onPick }: { option: ChangeOption; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      data-variant="inset"
      className={cx(
        "surface select-anim press flex min-h-30 min-w-0 flex-col items-start gap-2 border-0 p-4 text-left text-ink",
        on && "bg-action-wash shadow-ring",
      )}
    >
      <IconTile tone={option.intensity} icon={ICONS[option.id]} />
      <span className="t-strong">{option.title}</span>
      <span className="t-cap">{option.detail}</span>
    </button>
  );
}
