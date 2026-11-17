import { SegmentedControl } from "../../ui/controls.tsx";
import { Group, RowInput, RowSelect, Section } from "../../ui/List.tsx";
import { type Form, REPEATS, TITLE_MAX } from "./add.ts";

const LENGTHS = [
  { value: "60", label: "1 h" },
  { value: "90", label: "1 h 30" },
  { value: "120", label: "2 h" },
];

type Props = { kind: "revision" | "busy"; form: Form; today: string; onChange: (patch: Partial<Form>) => void };

/** Révision (length in buttons, day, time, repeat) or Indispo (optional title, day, start and end). */
export function EventForm({ kind, form, today, onChange: set }: Props) {
  return (
    <>
      {kind === "revision" && (
        <Section title="Durée">
          <SegmentedControl
            label="Durée"
            items={LENGTHS}
            value={String(form.minutes)}
            onChange={(v) => set({ minutes: Number(v) })}
          />
        </Section>
      )}
      <Group>
        {kind === "busy" && (
          <RowInput
            label="Titre"
            maxLength={TITLE_MAX}
            placeholder="Ex. : Soirée chez Léa"
            value={form.title}
            onChange={(title) => set({ title })}
          />
        )}
        <RowInput label="Jour" type="date" min={today} value={form.date} onChange={(d) => set({ date: d })} />
        <RowInput
          label={kind === "busy" ? "Début" : "Heure"}
          type="time"
          value={form.start}
          onChange={(start) => set({ start })}
        />
        {kind === "busy" && <RowInput label="Fin" type="time" value={form.end} onChange={(end) => set({ end })} />}
        {kind === "revision" && (
          <RowSelect label="Répéter" value={form.repeat} options={REPEATS} onChange={(repeat) => set({ repeat })} />
        )}
      </Group>
      <p className="t-cap m-0 px-4">
        {kind === "busy"
          ? "Reggie ne place aucune course sur ce créneau."
          : "Si une course tombe sur ce créneau, Reggie la déplace et te le dit."}
      </p>
    </>
  );
}
