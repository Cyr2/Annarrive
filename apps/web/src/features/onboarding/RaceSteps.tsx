import { useEffect } from "react";
import { addDays } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Group, RowInput } from "../../ui/List.tsx";
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

const VERDICTS = {
  atteignable: {
    label: "Atteignable",
    tone: "bg-easy-wash text-easy-deep",
    text: "Ton plan est construit pour ce chrono.",
  },
  ambitieux: {
    label: "Ambitieux",
    tone: "bg-warn-wash text-warn-deep",
    text: "Un beau défi. Ton plan t'en rapproche semaine après semaine, et on fait le point en route.",
  },
};

function TimeBox({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="surface flex min-w-0 flex-1 items-baseline justify-center gap-1 px-3 py-2" data-variant="inset">
      <span className="sr-only-label">{label}</span>
      <input
        inputMode="numeric"
        maxLength={2}
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
        className="t-figure w-full min-w-0 border-0 bg-transparent text-right text-ink"
      />
      <span className="t-strong flex-none text-ink-2">{unit}</span>
    </label>
  );
}

export function TargetStep() {
  const draft = useDraft();
  const verdict = useOnboarding((s) => s.verdict);
  // biome-ignore lint/correctness/useExhaustiveDependencies: asks again when the typed time changes
  useEffect(() => {
    // Asks once she stops typing.
    const timer = setTimeout(() => void useOnboarding.getState().checkTarget(), 400);
    return () => clearTimeout(timer);
  }, [draft.hours, draft.minutes]);
  const shown = verdict ? VERDICTS[verdict] : undefined;
  return (
    <>
      <Card>
        <div className="flex gap-2">
          <TimeBox label="Heures" unit="h" value={draft.hours} onChange={(hours) => update({ hours })} />
          <TimeBox label="Minutes" unit="min" value={draft.minutes} onChange={(minutes) => update({ minutes })} />
        </div>
      </Card>
      <div aria-live="polite" className="flex flex-col items-start gap-2 px-1">
        {shown && (
          <>
            <span className={`t-label rounded-full px-3 py-1 ${shown.tone}`}>{shown.label}</span>
            <p className="t-sub m-0">{shown.text}</p>
          </>
        )}
        {verdict === null && <p className="t-sub m-0">On saura te le dire après tes premières courses.</p>}
      </div>
    </>
  );
}

export function RunsStep() {
  const { runsPerWeek } = useDraft();
  return (
    <ChoiceGroup label="Courses par semaine" className="grid grid-cols-3 gap-2">
      {([3, 4, 5] as const).map((n) => (
        <BigChoice
          key={n}
          className="min-h-24 text-center"
          mark={false}
          label={<span className="t-figure">{n}</span>}
          detail="par semaine"
          on={runsPerWeek === n}
          onClick={() => update({ runsPerWeek: n })}
        />
      ))}
    </ChoiceGroup>
  );
}
