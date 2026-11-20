import { Group, RowDuration, RowInput, RowSelect } from "../../ui/List.tsx";
import { type Form, REPEATS, TITLE_MAX } from "./add.ts";

/** A revision block fits in a day. */
const MAX_HOURS = 8;

type Props = { kind: "revision" | "busy"; form: Form; today: string; onChange: (patch: Partial<Form>) => void };

/** Révision (day, time, length on the native wheel, repeat) or Occupée (optional title, day, start and end). */
export function EventForm({ kind, form, today, onChange: set }: Props) {
  return (
    <>
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
          <RowDuration
            label="Durée"
            minutes={form.minutes}
            maxHours={MAX_HOURS}
            onChange={(minutes) => set({ minutes })}
          />
        )}
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
