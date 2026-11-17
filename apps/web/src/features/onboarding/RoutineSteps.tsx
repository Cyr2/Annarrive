import { useId } from "react";
import { weekdayName } from "../../lib/date.ts";
import { Button, Switch } from "../../ui/controls.tsx";
import { Group, RowInput, RowSelect, Section } from "../../ui/List.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import type { StrengthDraft } from "./onboarding.ts";
import { DayChips, update, useDraft } from "./parts.tsx";

export function BedtimeStep() {
  const { bedtime } = useDraft();
  return (
    <Group>
      <RowInput label="Coucher" type="time" value={bedtime} onChange={(v) => update({ bedtime: v })} />
    </Group>
  );
}

export function LimitsStep() {
  const draft = useDraft();
  return (
    <>
      <Section footnote="Aucune course ne commence avant, ni ne finit après.">
        <Group>
          <RowInput
            label="Pas avant"
            type="time"
            value={draft.earliest}
            onChange={(earliest) => update({ earliest })}
          />
          <RowInput
            label="Pas après"
            type="time"
            value={draft.latestEnd}
            onChange={(latestEnd) => update({ latestEnd })}
          />
        </Group>
      </Section>
      <Section title="Jours sans course">
        <DayChips label="Jours sans course" value={draft.noRunDays} onChange={(noRunDays) => update({ noRunDays })} />
      </Section>
    </>
  );
}

const DAY_OPTIONS = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: weekdayName(d - 1) }));

function StrengthCard({ item, index }: { item: StrengthDraft; index: number }) {
  const legsId = useId();
  const { strength } = useDraft();
  const change = (patch: Partial<StrengthDraft>) =>
    update({ strength: strength.map((s) => (s.id === item.id ? { ...s, ...patch } : s)) });
  return (
    <Section title={`Séance ${index + 1}`}>
      <Group>
        <RowInput
          label="Nom"
          placeholder="Ex. : Haut du corps"
          value={item.name}
          onChange={(name) => change({ name })}
        />
        <div className="row">
          <span id={legsId} className="t-body">
            Travaille les jambes
          </span>
          <Switch checked={item.legs} onChange={(legs) => change({ legs })} labelledBy={legsId} />
        </div>
        <RowSelect
          label="Jour"
          value={String(item.day)}
          options={DAY_OPTIONS}
          onChange={(day) => change({ day: Number(day) })}
        />
        <RowInput label="Heure" type="time" value={item.start} onChange={(start) => change({ start })} />
      </Group>
      <TextButton
        tone="danger"
        className="self-start px-4"
        onClick={() => update({ strength: strength.filter((s) => s.id !== item.id) })}
      >
        Retirer cette séance
      </TextButton>
    </Section>
  );
}

export function StrengthStep() {
  const { strength } = useDraft();
  const add = () =>
    update({
      strength: [...strength, { id: `${Date.now()}`, name: "", legs: false, day: 1, start: "18:00" }],
    });
  return (
    <>
      {strength.map((item, i) => (
        <StrengthCard key={item.id} item={item} index={i} />
      ))}
      <Button icon="plus" onClick={add}>
        {strength.length ? "Ajouter une autre séance" : "Ajouter une séance"}
      </Button>
    </>
  );
}
