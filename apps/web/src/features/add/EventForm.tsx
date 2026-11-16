import { useState } from "react";
import { Button } from "../../ui/Button.tsx";
import { Group, RowInput, RowSelect, Section } from "../../ui/List.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
import { usePlan } from "../plan/store.ts";
import { busyEvent, type Form, isValidSpan, REPEATS, revisionEvent } from "./add.ts";

const LENGTHS = [
  { value: "60", label: "1 h" },
  { value: "90", label: "1 h 30" },
  { value: "120", label: "2 h" },
];

type Props = { kind: "revision" | "busy"; date: string; today: string; close: () => void };

/** Révision (length in buttons, day, time, repeat) or Indispo (optional title, day, start and end). */
export function EventForm({ kind, date, today, close }: Props) {
  const apply = usePlan((s) => s.apply);
  const [form, setForm] = useState<Form>({
    title: "",
    date,
    start: "14:00",
    end: "18:00",
    minutes: 120,
    repeat: "never",
  });
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const valid = Boolean(form.date) && (kind === "revision" ? Boolean(form.start) : isValidSpan(form.start, form.end));
  const add = async () => {
    const event = kind === "revision" ? revisionEvent(form) : busyEvent(form);
    if (await apply((api) => api.addEvent(event))) close();
  };
  return (
    <>
      {kind === "revision" && (
        <Section title="Durée">
          <Segmented
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
            placeholder="Soirée chez Léa"
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
          ? "Reggie ne place rien sur ce créneau."
          : "Si une course tombe sur ce créneau, Reggie la déplace et te le dit."}
      </p>
      <Button disabled={!valid} onClick={() => void add()}>
        Ajouter
      </Button>
    </>
  );
}
