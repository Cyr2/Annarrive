import { useState } from "react";
import type { ChangeOption, ChangeOptionId } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, relativeMoment } from "../../lib/date.ts";
import { IconTile } from "../../ui/bits.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button } from "../../ui/controls.tsx";
import type { IconName } from "../../ui/Icon.tsx";
import { SessionChip } from "../../ui/SessionShape.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { AskReggie } from "../reggie/AskReggie.tsx";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { sessionContext } from "../today/today.ts";
import { useLoad } from "../useLoad.ts";

const ICONS: Record<ChangeOptionId, IconName> = { shorter: "clock", easier: "run", equivalent: "change", jog: "arc" };

/** Changer (design/Changer): keeps the moment, changes the content. Never harder than the plan. */
export default function ChangeSheet({ spec, ...sheet }: SheetProps<"change">) {
  const plan = usePlan();
  const run = findRun(plan, spec.id);
  const options = useLoad((api) => api.changeOptions(spec.id), spec.id);
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
      {chosen && (
        <Surface key={chosen.id} variant="inset" className="flip-in flex flex-col gap-2 px-4 py-3">
          <span className="t-cap">
            Au lieu de <s>{[run.title, run.mainSet, duration(run.durationMin)].filter(Boolean).join(", ")}</s>
          </span>
          <SessionChip tone={chosen.intensity}>{chosen.title}</SessionChip>
          <span className="t-body">{chosen.detail}</span>
        </Surface>
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
