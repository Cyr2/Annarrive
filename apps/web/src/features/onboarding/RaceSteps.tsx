import { useEffect } from "react";
import { addDays } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { SegmentedControl } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, RowInput } from "../../ui/List.tsx";
import { TimeBoxes } from "../../ui/TimeBoxes.tsx";
import { TargetTag, VERDICT_KIND } from "../program/TargetTag.tsx";
import { DISTANCES, distanceOf, type Race } from "./onboarding.ts";
import { BigChoice, Card, update, useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

const CHOICES: { value: Race; label: string }[] = [...DISTANCES, { value: "other", label: "Autre" }];

export function RaceStep() {
  const draft = useDraft();
  const today = useOnboarding((s) => s.today);
  const closest = draft.race === "other" ? DISTANCES.find((d) => d.value === distanceOf(draft)) : undefined;
  return (
    <>
      <ChoiceGroup label="Distance" className="grid grid-cols-2 gap-2">
        {CHOICES.map((c) => (
          <BigChoice
            key={c.label}
            label={c.label}
            on={draft.race === c.value}
            onClick={() => update({ race: c.value })}
          />
        ))}
        <BigChoice
          className="col-span-2"
          label="Pas de course"
          detail="Juste entretenir ma forme"
          on={draft.race === "none"}
          onClick={() => update({ race: "none" })}
        />
      </ChoiceGroup>
      {draft.race !== undefined && draft.race !== "none" && (
        <Group>
          {draft.race === "other" && (
            <RowInput
              label="Distance en km"
              inputMode="decimal"
              placeholder="15"
              value={draft.otherKm}
              onChange={(otherKm) => update({ otherKm })}
            />
          )}
          <RowInput
            label="Date"
            type="date"
            min={addDays(today, 1)}
            value={draft.date}
            onChange={(date) => update({ date })}
          />
        </Group>
      )}
      {closest && <p className="t-cap m-0 px-4">Ton plan suivra celui du {closest.label.toLowerCase()}.</p>}
    </>
  );
}

const VERDICT_TEXT = {
  atteignable: "Ton plan est construit pour ce chrono.",
  ambitieux: "Un beau défi. Ton plan t'en rapproche semaine après semaine, et on fait le point en route.",
} as const;

const MODES = [
  { value: "time", label: "Viser un chrono" },
  { value: "finish", label: "La finir" },
] as const;

export function TargetStep() {
  const draft = useDraft();
  const verdict = useOnboarding((s) => s.verdict);
  // biome-ignore lint/correctness/useExhaustiveDependencies: asks again once she stops typing a new time
  useEffect(() => {
    const timer = setTimeout(() => void useOnboarding.getState().checkTarget(), 400);
    return () => clearTimeout(timer);
  }, [draft.targetSec, draft.finish]);
  const shown = verdict && !draft.finish && draft.targetSec > 0 ? verdict : undefined;
  return (
    <>
      <SegmentedControl
        label="Ton objectif"
        items={[...MODES]}
        value={draft.finish ? "finish" : "time"}
        onChange={(mode) => update({ finish: mode === "finish" })}
      />
      {draft.finish ? (
        <Card className="flex-row items-start">
          <Icon name="flag" className="mt-px flex-none text-ink-2" />
          <p className="t-body m-0">Franchir la ligne, à ton rythme. Ton plan te prépare à la finir sereine.</p>
        </Card>
      ) : (
        <TimeBoxes seconds={draft.targetSec} onChange={(targetSec) => update({ targetSec })} />
      )}
      <div aria-live="polite" className="flex min-h-16 flex-col items-start gap-2 px-1">
        {shown && (
          <>
            <TargetTag kind={VERDICT_KIND[shown]} />
            <p className="t-sub m-0">{VERDICT_TEXT[shown]}</p>
          </>
        )}
        {verdict === null && !draft.finish && draft.targetSec > 0 && (
          <p className="t-sub m-0">On saura te le dire après tes premières courses.</p>
        )}
      </div>
    </>
  );
}
