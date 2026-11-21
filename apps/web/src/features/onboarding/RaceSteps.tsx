import { useEffect } from "react";
import { addDays } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Chip } from "../../ui/controls.tsx";
import { Group, RowInput, RowSelect } from "../../ui/List.tsx";
import { TimeBoxes } from "../../ui/TimeBoxes.tsx";
import { RACE_AGO, RACE_DISTANCES } from "../program/program.ts";
import { TargetTag, VERDICT_KIND } from "../program/TargetTag.tsx";
import { DISTANCES, distanceOf, type Race } from "./onboarding.ts";
import { Ask, BigChoice, update, useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

const CHOICES: { value: Race; label: string; detail?: string }[] = [
  ...DISTANCES.map((d) => ({ ...d, ...(d.value === 21097.5 ? { detail: "21,1 km" } : {}) })),
  { value: "other", label: "Autre" },
  { value: "none", label: "Pas d'objectif", detail: "Juste entretenir ma forme" },
];

const VERDICT_TEXT = {
  atteignable: "Ton plan est construit pour ce chrono.",
  ambitieux: "Un beau défi. Ton plan t'en rapproche semaine après semaine.",
} as const;

/** What her target looks like, said as she types it; empty boxes: she runs to finish. */
function Verdict() {
  const { targetSec } = useDraft();
  const verdict = useOnboarding((s) => s.verdict);
  // biome-ignore lint/correctness/useExhaustiveDependencies: asks again once she stops typing a new time
  useEffect(() => {
    const timer = setTimeout(() => void useOnboarding.getState().checkTarget(), 400);
    return () => clearTimeout(timer);
  }, [targetSec]);
  // Holds its height, so the verdict arriving never pushes the page.
  return (
    <div aria-live="polite" className="flex min-h-16 flex-col items-start gap-2 px-1">
      {targetSec <= 0 ? (
        <p className="t-cap m-0 px-3">Sans chrono, ton plan te prépare à la finir sereine.</p>
      ) : verdict ? (
        <>
          <TargetTag kind={VERDICT_KIND[verdict]} />
          <p className="t-sub m-0">{VERDICT_TEXT[verdict]}</p>
        </>
      ) : (
        verdict === null && <p className="t-sub m-0">On saura te le dire après tes premières courses.</p>
      )}
    </div>
  );
}

export function RaceStep() {
  const draft = useDraft();
  const today = useOnboarding((s) => s.today);
  const closest = draft.race === "other" ? DISTANCES.find((d) => d.value === distanceOf(draft)) : undefined;
  const race = draft.race !== undefined && draft.race !== "none";
  return (
    <>
      <ChoiceGroup label="Distance" className="flex flex-col gap-2">
        {CHOICES.map((c) => (
          <BigChoice
            key={c.label}
            label={c.label}
            detail={c.detail}
            on={draft.race === c.value}
            onClick={() => update({ race: c.value })}
          />
        ))}
      </ChoiceGroup>
      {race && (
        <Ask question="Quand ?" help={closest && `Ton plan suivra celui du ${closest.label.toLowerCase()}.`}>
          <Group>
            {draft.race === "other" && (
              <RowInput
                label="Distance en km"
                inputMode="decimal"
                placeholder="Ex. : 15"
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
        </Ask>
      )}
      {race && (
        <Ask question="Ton chrono visé, si tu en as un">
          <TimeBoxes seconds={draft.targetSec} onChange={(targetSec) => update({ targetSec })} />
          <Verdict />
        </Ask>
      )}
    </>
  );
}

/** « Ta dernière course », as the sheet of Programme: one race, the latest. Skipped with « Je n'en ai pas ». */
export function LastStep() {
  const draft = useDraft();
  return (
    <>
      <Ask question="Quelle distance ?">
        <ChoiceGroup label="Distance" className="flex flex-wrap gap-2">
          {RACE_DISTANCES.map((d) => (
            <Chip key={d.label} selected={draft.lastRace === d.value} onClick={() => update({ lastRace: d.value })}>
              {d.label}
            </Chip>
          ))}
        </ChoiceGroup>
      </Ask>
      <Ask question="En combien de temps ?">
        <TimeBoxes seconds={draft.lastSec} onChange={(lastSec) => update({ lastSec })} />
      </Ask>
      <Ask question="Il y a combien de temps ?" help="Une seule course : la plus récente. Tes allures en découlent.">
        <Group>
          <RowSelect
            label="Il y a"
            value={draft.lastAgo}
            options={RACE_AGO}
            onChange={(lastAgo) => update({ lastAgo })}
          />
        </Group>
      </Ask>
    </>
  );
}
