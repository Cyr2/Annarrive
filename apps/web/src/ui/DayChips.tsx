import { weekdayName } from "../lib/date.ts";
import { ChoiceGroup } from "./ChoiceGroup.tsx";
import { Chip } from "./controls.tsx";

type Props = {
  label: string;
  /** The days picked, 0 = Monday. */
  selected: number[];
  onToggle: (day: number) => void;
};

/** The days with `day` added or taken out, in week order. */
export const toggled = (days: number[], day: number) =>
  days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b);

/**
 * The seven days as chips (« Lun », « Mar »...): every choice of a weekday in the app, one day or several.
 * Wraps on a 320 px screen rather than shrinking under 44 px.
 */
export function DayChips({ label, selected, onToggle }: Props) {
  return (
    <ChoiceGroup label={label} className="flex flex-wrap gap-2">
      {Array.from({ length: 7 }, (_, day) => {
        const name = weekdayName(day);
        return (
          // Named by what it shows (« Lun »), so voice control finds it by its visible text.
          <Chip key={name} selected={selected.includes(day)} onClick={() => onToggle(day)}>
            {name.slice(0, 3)}
          </Chip>
        );
      })}
    </ChoiceGroup>
  );
}
