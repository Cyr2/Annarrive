import { useState } from "react";
import type { ChangeOption, ChangeOptionId } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { relativeMoment } from "../../lib/date.ts";
import { Button } from "../../ui/Button.tsx";
import { IconTile } from "../../ui/bits.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import type { IconName } from "../../ui/Icon.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TONES } from "../../ui/tones.ts";
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
    <Sheet {...sheet} title="Changer la séance">
      <p className="t-cap m-0 px-4">
        Même moment, {relativeMoment(run.date, run.start, today).toLowerCase()}. Prévu : {run.title.toLowerCase()}
        {run.mainSet ? ` ${run.mainSet}` : ""}, {run.durationMin} min.
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
        <div
          key={chosen.id}
          className={cx("flip-in flex flex-col gap-1 rounded-group px-4 py-3", TONES[chosen.intensity].wash)}
        >
          <span className={cx("t-title", TONES[chosen.intensity].deep)}>{chosen.title}</span>
          <span className={cx("t-body", TONES[chosen.intensity].ink)}>{chosen.detail}</span>
        </div>
      )}
      <AskReggie context={sessionContext(run, today)} onSent={() => sheet.onOpenChange(false)} />
      <Button disabled={!chosen} onClick={() => void validate()}>
        Valider{chosen ? ` : ${chosen.title.toLowerCase()}` : ""}
      </Button>
    </Sheet>
  );
}

function OptionCard({ option, on, onPick }: { option: ChangeOption; on: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cx(
        "select-anim press flex min-h-30 flex-col items-start gap-2 rounded-group border-0 bg-surface p-4 text-left text-text",
        on && "shadow-ring",
      )}
    >
      <IconTile tone={option.intensity} icon={ICONS[option.id]} />
      <span className="t-strong">{option.title}</span>
      <span className="t-cap">{option.detail}</span>
    </button>
  );
}
