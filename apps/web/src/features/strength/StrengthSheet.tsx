import { useEffect, useState } from "react";
import type { Strength } from "../../api/schemas.ts";
import { addDays, duration, mondayOf, weekdayName } from "../../lib/date.ts";
import { Switch } from "../../ui/controls.tsx";
import { Group, RowInput, RowSelect, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { REPEATS } from "../add/add.ts";
import { todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";

const DAYS = Array.from({ length: 7 }, (_, i) => ({ value: String(i), label: weekdayName(i) }));
const LENGTHS = [30, 45, 60, 75, 90, 120].map((m) => ({ value: String(m), label: duration(m) }));
const BLANK: Strength = {
  id: "",
  name: "",
  legs: false,
  weekday: 0,
  start: "19:00",
  durationMin: 60,
  repeat: "weekly",
  placed: true,
};

/** Séance de muscu (design/Muscu): name, legs, day, time, length, repeat. OK saves, Annuler leaves it as it was. */
export default function StrengthSheet({ spec, ...sheet }: SheetProps<"strength">) {
  const program = usePlan((s) => s.program);
  useEffect(() => {
    if (!usePlan.getState().program) void usePlan.getState().loadProgram();
  }, []);
  // An existing session waits for the program, so the form starts from what is saved.
  if (spec.templateId && !program) return null;
  const saved = program?.strength.find((t) => t.id === spec.templateId);
  return <StrengthForm saved={saved} sheet={sheet} />;
}

type FormProps = { saved?: Strength; sheet: Omit<SheetProps<"strength">, "spec"> };

function StrengthForm({ saved, sheet }: FormProps) {
  const apply = usePlan((s) => s.apply);
  const today = usePlan(todayOf);
  // The occurrence of this week: "Cette semaine seulement" skips it, the other choice stops the series there.
  const thisWeek = (template: Strength) => addDays(mondayOf(today), template.weekday);
  const [draft, setDraft] = useState<Strength>(saved ?? { ...BLANK, id: `s-${Date.now()}` });
  const [confirm, setConfirm] = useState(false);
  const set = (patch: Partial<Strength>) => setDraft({ ...draft, ...patch });

  const run = async (action: Parameters<typeof apply>[0]) => {
    if (await apply(action)) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Séance de muscu"
      action={{
        label: "OK",
        disabled: !draft.name.trim() || !draft.start,
        onClick: () => void run((api) => api.saveStrength({ ...draft, name: draft.name.trim() }, Boolean(saved))),
      }}
    >
      <Group>
        <RowInput label="Nom" value={draft.name} placeholder="Ex. : Jambes" onChange={(name) => set({ name })} />
      </Group>
      <Section footnote="Reggie ne met pas de séance dure ni de sortie longue dans les 24 h qui suivent.">
        <Group>
          <div className="row">
            <span id="legs-label" className="t-body">
              Travaille les jambes
            </span>
            <Switch checked={draft.legs} onChange={(legs) => set({ legs })} labelledBy="legs-label" />
          </div>
        </Group>
      </Section>
      <Group>
        <RowSelect
          label="Jour"
          value={String(draft.weekday)}
          options={DAYS}
          onChange={(d) => set({ weekday: Number(d) })}
        />
        <RowInput label="Heure" type="time" value={draft.start} onChange={(start) => set({ start })} />
        <RowSelect
          label="Durée"
          value={String(draft.durationMin)}
          options={LENGTHS}
          onChange={(m) => set({ durationMin: Number(m) })}
        />
        <RowSelect label="Répéter" value={draft.repeat} options={REPEATS} onChange={(repeat) => set({ repeat })} />
      </Group>
      {saved && !confirm && (
        <Group>
          <TextButton tone="danger" className="min-h-13 w-full" onClick={() => setConfirm(true)}>
            Supprimer la séance
          </TextButton>
        </Group>
      )}
      {saved && confirm && (
        <Section title={`Supprimer ${saved.name} ?`}>
          <Group>
            <TextButton
              tone="danger"
              className="min-h-13 w-full"
              onClick={() => void run((api) => api.deleteStrength(saved.id, "all", thisWeek(saved)))}
            >
              Cette semaine et les suivantes
            </TextButton>
            <TextButton
              tone="danger"
              className="hairline-top min-h-13 w-full"
              onClick={() => void run((api) => api.deleteStrength(saved.id, "one", thisWeek(saved)))}
            >
              Cette semaine seulement
            </TextButton>
          </Group>
        </Section>
      )}
    </Sheet>
  );
}
