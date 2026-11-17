import type { Slot, Strength } from "../../api/schemas.ts";
import { duration } from "../../lib/date.ts";
import { IconTile } from "../../ui/bits.tsx";
import { Group, RowInput } from "../../ui/List.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { repeatLabel } from "./add.ts";
import { LegsTag } from "./StrengthList.tsx";

type Props = { template: Strength; slot: Slot; today: string; onChange: (slot: Slot) => void };

/** "Placer": the session, then its day and time, prefilled on her habit. What it means for her runs, said before. */
export function PlaceStep({ template, slot, today, onChange }: Props) {
  return (
    <>
      <Surface variant="inset" className="flex items-center gap-3 px-4 py-3">
        <IconTile tone="strength" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="t-strong break-words">{template.name}</span>
          <span className="t-cap">
            {duration(template.durationMin)}, {repeatLabel(template.repeat).toLowerCase()}
          </span>
        </span>
        {template.legs && <LegsTag />}
      </Surface>
      <Group>
        <RowInput
          label="Jour"
          type="date"
          min={today}
          value={slot.date}
          onChange={(date) => onChange({ ...slot, date })}
        />
        <RowInput label="Heure" type="time" value={slot.start} onChange={(start) => onChange({ ...slot, start })} />
      </Group>
      <p className="t-cap m-0 px-4">
        {template.legs
          ? "Séance jambes : pas de fractionné ni de sortie longue dans les 24 h qui suivent. Si une course tombe dedans, Reggie la déplace et te le dit."
          : "Si une course tombe sur ce créneau, Reggie la déplace et te le dit."}
      </p>
    </>
  );
}
