import { useState } from "react";
import type { Settings } from "../../api/schemas.ts";
import { Button, SegmentedControl } from "../../ui/controls.tsx";
import { DayChips, toggled } from "../../ui/DayChips.tsx";
import { Group, RowDuration, RowInput, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import type { SettingKey } from "../sheets/store.ts";
import { SETTING_LABELS } from "./program.ts";

// The plan holds 3 to 5 runs a week (algo.md 4.2).
const COUNTS = ["3", "4", "5"].map((value) => ({ value, label: value }));

const REORGANIZED =
  "La semaine en cours et les suivantes sont réorganisées. Ce que tu as déplacé à la main reste en place.";

/** What a setting does, in one line under it; the others say what saving it changes. */
const NOTES: Partial<Record<SettingKey, string>> = {
  bedtime: "Reggie finit tes courses au moins 1 h avant ton coucher.",
  longRunDays: "Reggie place ta sortie longue sur le plus libre de ces jours, chaque semaine.",
  preferredHour: "Reggie place tes courses autour de cette heure quand c'est possible.",
  travelMin: "Pour te doucher, te changer et y aller. Tes courses finissent assez tôt pour ça.",
};

/** No long-run day, or an hour she has not picked: on Automatique the hour shown is only a suggestion. */
const nothingToSave = (key: SettingKey, draft: Settings, picked: boolean) =>
  key === "longRunDays" ? draft.longRunDays.length === 0 : key === "preferredHour" && !(draft.preferredHour && picked);

/** One training limit, picked with buttons or the iOS time wheel. Saving reorganizes this week and the next. */
export default function SettingSheet({ spec, ...sheet }: SheetProps<"setting">) {
  const settings = usePlan((s) => s.program?.settings);
  const apply = usePlan((s) => s.apply);
  // On Automatique, « Heure préférée » opens on the hour she usually runs at (else the evening hour of the mockup,
  // after her classes), as a suggestion: Enregistrer waits until she changes it.
  const [draft, setDraft] = useState<Settings | undefined>(
    settings && { ...settings, preferredHour: settings.preferredHour ?? settings.usualHour ?? "18:00" },
  );
  const [picked, setPicked] = useState(Boolean(settings?.preferredHour));
  if (!draft) return null;
  const key = spec.key;
  const empty = nothingToSave(key, draft, picked);
  const save = async (patch: Partial<Settings> = { [key]: draft[key] }) => {
    const done = await apply((api) => api.updateSettings(patch));
    if (done) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title={SETTING_LABELS[key]}
      footer={
        <>
          <Button variant="filled" size="large" disabled={empty} onClick={() => void save()}>
            Enregistrer
          </Button>
          {/* Back to automatic: the coach takes the hour she usually runs at again (algo.md S7). */}
          {key === "preferredHour" && settings?.preferredHour && (
            <TextButton onClick={() => void save({ preferredHour: undefined })}>Revenir à l'automatique</TextButton>
          )}
        </>
      }
    >
      {key === "runsPerWeek" && (
        <SegmentedControl
          label={SETTING_LABELS[key]}
          items={COUNTS}
          value={String(draft.runsPerWeek)}
          onChange={(v) => setDraft({ ...draft, runsPerWeek: Number(v) })}
        />
      )}
      {(key === "noRunDays" || key === "longRunDays") && (
        <DayToggles
          label={SETTING_LABELS[key]}
          days={draft[key]}
          onChange={(days) => setDraft({ ...draft, [key]: days })}
        />
      )}
      {(key === "notBefore" || key === "notAfter" || key === "bedtime" || key === "preferredHour") && (
        <Group>
          <RowInput
            label={key === "preferredHour" ? "Heure" : SETTING_LABELS[key]}
            type="time"
            value={draft[key] ?? ""}
            onChange={(v) => {
              setPicked(true);
              setDraft({ ...draft, [key]: v });
            }}
          />
        </Group>
      )}
      {key === "travelMin" && (
        <Group>
          <RowDuration
            label="Temps"
            minutes={draft.travelMin}
            maxHours={2}
            onChange={(travelMin) => setDraft({ ...draft, travelMin })}
          />
        </Group>
      )}
      <p className="t-cap m-0 px-4">{NOTES[key] ?? REORGANIZED}</p>
    </Sheet>
  );
}

function DayToggles({ label, days, onChange }: { label: string; days: number[]; onChange: (days: number[]) => void }) {
  return (
    <Section title={label}>
      <DayChips label={label} selected={days} onToggle={(day) => onChange(toggled(days, day))} />
    </Section>
  );
}
