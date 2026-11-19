import { useId } from "react";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button, Switch } from "../../ui/controls.tsx";
import { DayChips } from "../../ui/DayChips.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { DayWindow } from "../program/DayWindow.tsx";
import type { StrengthDraft } from "./onboarding.ts";
import { BigChoice, ProfileDays, update, useDraft } from "./parts.tsx";

export function WeekStep() {
  const { runsPerWeek, noRunDays, longRunDays } = useDraft();
  return (
    <>
      <Section title="Courses par semaine">
        <ChoiceGroup label="Courses par semaine" className="grid grid-cols-3 gap-2">
          {([3, 4, 5] as const).map((n) => (
            <BigChoice
              key={n}
              tile
              className="min-h-20 items-center justify-center"
              label={<span className="t-figure block text-center">{n}</span>}
              on={runsPerWeek === n}
              onClick={() => update({ runsPerWeek: n })}
            />
          ))}
        </ChoiceGroup>
      </Section>
      <Section title="Jours sans course" footnote="Facultatif. Laisse vide si tous les jours te vont.">
        <ProfileDays label="Jours sans course" value={noRunDays} onChange={(days) => update({ noRunDays: days })} />
      </Section>
      <Section
        title="Ta sortie longue"
        footnote="Les jours où tu as le temps. Reggie prend le plus libre chaque semaine."
      >
        <ProfileDays
          label="Jours de sortie longue"
          value={longRunDays}
          onChange={(days) => update({ longRunDays: days })}
        />
      </Section>
    </>
  );
}

export function HoursStep() {
  const draft = useDraft();
  return (
    <Section>
      <Group>
        <DayWindow notBefore={draft.earliest} notAfter={draft.latestEnd} bedtime={draft.bedtime} />
        <RowInput label="Pas avant" type="time" value={draft.earliest} onChange={(earliest) => update({ earliest })} />
        <RowInput
          label="Pas après"
          type="time"
          value={draft.latestEnd}
          onChange={(latestEnd) => update({ latestEnd })}
        />
        <RowInput
          label="Heure de coucher"
          type="time"
          value={draft.bedtime}
          onChange={(bedtime) => update({ bedtime })}
        />
      </Group>
    </Section>
  );
}

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
      </Group>
      <DayChips label="Jour" selected={[item.day - 1]} onToggle={(day) => change({ day: day + 1 })} />
      <Group>
        <RowInput label="Heure" type="time" value={item.start} onChange={(start) => change({ start })} />
      </Group>
      <TextButton
        tone="danger"
        className="self-start px-4"
        onClick={() => update({ strength: strength.filter((s) => s.id !== item.id) })}
      >
        Supprimer cette séance
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
