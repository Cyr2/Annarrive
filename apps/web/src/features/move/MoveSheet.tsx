import { useState } from "react";
import type { Slot } from "../../api/schemas.ts";
import { mondayOf, relativeMoment } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { useLoad } from "../useLoad.ts";
import { consequenceOf, shortMoment } from "./move.ts";
import { Consequence, SessionBanner, SlotCard } from "./parts.tsx";
import { SlotPicker } from "./SlotPicker.tsx";

/** Déplacer (design/Deplacer): keeps the content, changes the moment. Three proposals, or a free pick. */
export default function MoveSheet({ spec, ...sheet }: SheetProps<"move">) {
  const plan = usePlan();
  const run = findRun(plan, spec.id);
  const options = useLoad((api) => api.moveOptions(spec.id), spec.id);
  const [picked, setPicked] = useState<Slot>();
  const [free, setFree] = useState(false);
  if (!run) return null;
  const today = todayOf(plan);
  const close = () => sheet.onOpenChange(false);
  // The first proposal stays picked until she picks something else.
  const slot = picked ?? (free ? undefined : options?.slots[0]);
  const act = async (action: Parameters<typeof plan.apply>[0]) => {
    if (await plan.apply(action)) close();
  };
  const stuck = options && options.slots.length === 0 && !free;
  const footer = stuck ? (
    <>
      <Button variant="filled" size="large" onClick={() => void act((api) => api.change(run.id, "jog"))}>
        Remplacer par un footing ce soir
      </Button>
      <Button size="large" onClick={() => void act((api) => api.skip(run.id))}>
        Passer cette séance
      </Button>
    </>
  ) : (
    options && (
      <>
        {slot && <Consequence text={consequenceOf(slot, options)} />}
        <Button
          variant="filled"
          size="large"
          disabled={!slot}
          onClick={() => slot && void act((api) => api.move(run.id, slot))}
        >
          {slot ? `Déplacer à ${shortMoment(slot, today)}` : "Choisis un moment"}
        </Button>
      </>
    )
  );
  return (
    <Sheet {...sheet} title="Déplacer" footer={footer}>
      <SessionBanner run={run} today={today} />
      {options === undefined && <p className="t-cap m-0 px-4">Reggie cherche les bons créneaux…</p>}
      {options === null && (
        <p className="t-cap m-0 px-4">Impossible de charger les créneaux. Réessaie dans un instant.</p>
      )}
      {stuck && (
        <Surface variant="inset" className="t-body px-4 py-3">
          Aucun créneau ne respecte ton plan cette semaine.
        </Surface>
      )}
      {options && !stuck && (
        <>
          <ChoiceGroup label="Créneaux proposés" className="flex flex-col gap-2">
            <h2 className="t-cap m-0 px-4">Créneaux proposés</h2>
            {options.slots.map((s) => (
              <SlotCard
                key={`${s.date}-${s.start}`}
                label={relativeMoment(s.date, s.start, today)}
                why={s.why}
                on={!free && slot?.date === s.date && slot.start === s.start}
                onPick={() => {
                  setFree(false);
                  setPicked(s);
                }}
              />
            ))}
          </ChoiceGroup>
          <SlotPicker
            open={free}
            onOpen={() => {
              // One choice at a time: opening the free pick drops the proposal.
              setFree(true);
              setPicked(undefined);
            }}
            monday={mondayOf(run.date)}
            options={options}
            today={today}
            value={free ? picked : undefined}
            onChange={setPicked}
            defaultStart={run.start}
          />
        </>
      )}
    </Sheet>
  );
}
