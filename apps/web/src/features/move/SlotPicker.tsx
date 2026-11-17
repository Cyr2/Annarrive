import type { MoveOptions, Slot } from "../../api/schemas.ts";
import { dayName } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Chip } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, RowSelect } from "../../ui/List.tsx";
import { dayChoices, timeChoices } from "./move.ts";

type Props = {
  open: boolean;
  onOpen: () => void;
  monday: string;
  options: MoveOptions;
  today: string;
  value?: Slot;
  onChange: (slot: Slot) => void;
  defaultStart: string;
};

/**
 * "Choisir un autre moment": day chips and a time. Days that break a rule stay pickable but quieter, with
 * their reason: she keeps the last word, the app adapts the content and says so.
 */
export function SlotPicker({ open, onOpen, monday, options, today, value, onChange, defaultStart }: Props) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        data-variant="inset"
        className="surface press t-body flex min-h-13 items-center justify-between border-0 px-4 text-ink"
      >
        Choisir un autre moment
        <Icon name="chevronRight" size={14} stroke={2.5} className="text-ink-3" />
      </button>
    );
  }
  const days = dayChoices(monday, options).filter((d) => d.date >= today);
  const start = value?.start ?? defaultStart;
  const blocked = days.find((d) => d.date === value?.date)?.blocked;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="t-cap m-0 px-4">Choisir un autre moment</h2>
      <ChoiceGroup label="Jour" className="flex flex-wrap gap-2">
        {days.map((day) => (
          <Chip
            key={day.date}
            selected={value?.date === day.date}
            icon={day.blocked ? "busy" : undefined}
            aria-label={`${dayName(day.date)}${day.blocked ? `, ${day.blocked}` : ""}`}
            // Quieter, never faded: the text keeps its 4.5:1 and the lock carries the meaning.
            style={day.blocked && value?.date !== day.date ? { color: "var(--color-ink-2)" } : undefined}
            onClick={() => onChange({ date: day.date, start })}
          >
            {dayName(day.date).slice(0, 3)}
          </Chip>
        ))}
      </ChoiceGroup>
      {!value && days.some((d) => d.blocked) && (
        <p className="t-cap m-0 px-4">
          Les jours marqués vont contre une règle de ton plan. Touche-en un pour savoir laquelle.
        </p>
      )}
      {blocked && (
        <p className="t-cap m-0 flex items-start gap-1.5 rounded-row bg-warn-wash px-3 py-2 text-warn-deep">
          <Icon name="info" size={16} className="mt-px flex-none" />
          {blocked}. Reggie adaptera le contenu de la séance.
        </p>
      )}
      <Group>
        <RowSelect
          label="Heure"
          value={start}
          options={timeChoices().map((t) => ({ value: t, label: t }))}
          onChange={(time) => value && onChange({ date: value.date, start: time })}
        />
      </Group>
    </section>
  );
}
