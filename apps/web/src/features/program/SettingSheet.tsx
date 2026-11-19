import { useState } from "react";
import type { Settings } from "../../api/schemas.ts";
import { Button, SegmentedControl } from "../../ui/controls.tsx";
import { DayChips, toggled } from "../../ui/DayChips.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { SETTING_LABELS } from "./program.ts";

// The plan holds 3 to 5 runs a week (algo.md 4.2).
const COUNTS = ["3", "4", "5"].map((value) => ({ value, label: value }));

/** One training limit, picked with buttons or the iOS time wheel. Saving reorganizes this week and the next. */
export default function SettingSheet({ spec, ...sheet }: SheetProps<"setting">) {
  const settings = usePlan((s) => s.program?.settings);
  const apply = usePlan((s) => s.apply);
  const [draft, setDraft] = useState<Settings | undefined>(settings);
  if (!draft) return null;
  const key = spec.key;
  const save = async () => {
    const patch = { [key]: draft[key] };
    const done = await apply((api) => api.updateSettings(patch));
    if (done) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title={SETTING_LABELS[key]}
      footer={
        <Button
          variant="filled"
          size="large"
          disabled={key === "longRunDays" && draft.longRunDays.length === 0}
          onClick={() => void save()}
        >
          Enregistrer
        </Button>
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
      {(key === "notBefore" || key === "notAfter" || key === "bedtime") && (
        <Group>
          <RowInput
            label={SETTING_LABELS[key]}
            type="time"
            value={draft[key]}
            onChange={(v) => setDraft({ ...draft, [key]: v })}
          />
        </Group>
      )}
      <p className="t-cap m-0 px-4">
        {key === "bedtime"
          ? "Reggie finit tes courses au moins 1 h avant ton coucher."
          : key === "longRunDays"
            ? "Reggie place ta sortie longue sur le plus libre de ces jours, chaque semaine."
            : "La semaine en cours et les suivantes sont réorganisées. Ce que tu as déplacé à la main reste en place."}
      </p>
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
