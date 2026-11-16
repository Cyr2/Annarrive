import type { MoveOptions, Slot } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { dayName } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
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
 * "Choisir un autre moment": seven day chips and a time. Days that break a rule stay pickable but greyed,
 * with their reason: she keeps the last word, the app adapts the content and says so.
 */
export function SlotPicker({ open, onOpen, monday, options, today, value, onChange, defaultStart }: Props) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="press t-body flex min-h-13 items-center justify-between rounded-row border-0 bg-surface px-4 text-text"
      >
        Choisir un autre moment
        <Icon name="chevronRight" size={14} stroke={2.5} className="text-text-faint" />
      </button>
    );
  }
  const days = dayChoices(monday, options).filter((d) => d.date >= today);
  const start = value?.start ?? defaultStart;
  const blocked = days.find((d) => d.date === value?.date)?.blocked;
  return (
    <section className="flex flex-col gap-2">
      <h2 id="day-title" className="t-cap m-0 px-4">
        Choisir un autre moment
      </h2>
      <ChoiceGroup label="Jour" className="grid grid-cols-7 gap-1">
        {days.map((day) => {
          const on = value?.date === day.date;
          return (
            <button
              key={day.date}
              type="button"
              aria-pressed={on}
              aria-label={`${dayName(day.date)}${day.blocked ? `, ${day.blocked}` : ""}`}
              onClick={() => onChange({ date: day.date, start })}
              className={cx(
                "select-anim t-label min-h-11 rounded-full border-0",
                on ? "bg-assistant text-on-accent" : "bg-surface text-text",
                day.blocked && !on && "opacity-40",
              )}
            >
              {dayName(day.date).slice(0, 3)}
            </button>
          );
        })}
      </ChoiceGroup>
      {blocked && (
        <p className="t-cap m-0 px-4 text-intense-ink">{blocked}. Reggie adaptera le contenu de la séance.</p>
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
