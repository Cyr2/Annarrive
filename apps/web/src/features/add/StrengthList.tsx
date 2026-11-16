import { useState } from "react";
import type { Strength } from "../../api/schemas.ts";
import { Button } from "../../ui/Button.tsx";
import { IconTile } from "../../ui/bits.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { usePlan } from "../plan/store.ts";
import { useSheet } from "../sheets/store.ts";
import { strengthEvent, strengthWhen, usualDate } from "./add.ts";

type Props = { templates: Strength[]; monday: string; today: string; close: () => void };

/** Her saved strength sessions: tap to edit, "Placer" to put one in the week at its usual day and time. */
export function StrengthList({ templates, monday, today, close }: Props) {
  const show = useSheet((s) => s.show);
  const [placing, setPlacing] = useState<string>();
  return (
    <>
      <Section title="Tes séances de muscu">
        <ul className="group m-0 list-none p-0">
          {templates.map((t) => (
            <li key={t.id} className="flex flex-col">
              <div className="flex items-center gap-3 pl-4">
                <IconTile tone="strength" />
                <button
                  type="button"
                  onClick={() => show({ kind: "strength", templateId: t.id })}
                  className="flex min-h-15 flex-1 flex-col justify-center border-0 bg-transparent p-0 text-left text-text"
                >
                  <span className="flex items-center gap-2">
                    <span className="t-body">{t.name}</span>
                    {t.legs && <LegsTag />}
                  </span>
                  <span className="t-cap">{strengthWhen(t)}</span>
                </button>
                <Button
                  variant="link"
                  className="t-strong pr-4"
                  onClick={() => setPlacing(placing === t.id ? undefined : t.id)}
                >
                  Placer
                </Button>
              </div>
              {placing === t.id && (
                <PlaceForm template={t} date={usualDate(t, monday, today)} today={today} close={close} />
              )}
            </li>
          ))}
        </ul>
      </Section>
      <Group>
        <button
          type="button"
          onClick={() => show({ kind: "strength" })}
          className="t-body flex min-h-13 items-center gap-3 border-0 bg-transparent px-4 text-link"
        >
          <Icon name="plus" size={20} stroke={2.25} />
          Nouvelle séance de muscu
        </button>
      </Group>
      <p className="t-cap m-0 px-4">
        Tu la places où tu veux dans la semaine. Reggie organise tes courses autour, avec 24 h d'écart après une séance
        jambes.
      </p>
    </>
  );
}

export function LegsTag() {
  return <span className="t-cap rounded-tile bg-class-wash px-2 py-0.5 text-class-ink">Jambes</span>;
}

function PlaceForm({
  template,
  date,
  today,
  close,
}: {
  template: Strength;
  date: string;
  today: string;
  close: () => void;
}) {
  const apply = usePlan((s) => s.apply);
  const [slot, setSlot] = useState({ date, start: template.start });
  const add = async () => {
    if (await apply((api) => api.addEvent(strengthEvent(template, slot.date, slot.start)))) close();
  };
  return (
    <div className="flex flex-col gap-2 border-t-[0.5px] border-hairline px-4 pt-1 pb-3">
      <div className="-mx-4 flex flex-col">
        <RowInput
          label="Jour"
          type="date"
          min={today}
          value={slot.date}
          onChange={(d) => setSlot({ ...slot, date: d })}
        />
        <RowInput label="Heure" type="time" value={slot.start} onChange={(s) => setSlot({ ...slot, start: s })} />
      </div>
      <Button disabled={!slot.date || !slot.start} onClick={() => void add()}>
        Ajouter
      </Button>
    </div>
  );
}
