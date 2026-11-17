import { useState } from "react";
import type { Run, Slot } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, mondayOf, relativeMoment } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Button } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { SessionChip } from "../../ui/SessionShape.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { useLoad } from "../useLoad.ts";
import { consequenceOf, shortMoment } from "./move.ts";
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
        {slot && <p className="t-cap m-0 px-1 text-center">{consequenceOf(slot, options)}</p>}
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

function SessionBanner({ run, today }: { run: Run; today: string }) {
  return (
    <Surface variant="inset" className="flex flex-col gap-1.5 px-4 py-3">
      <SessionChip tone={run.intensity}>
        {run.title} · {duration(run.durationMin)}
      </SessionChip>
      <span className="t-cap">Prévu {relativeMoment(run.date, run.start, today).toLowerCase()}</span>
    </Surface>
  );
}

type SlotProps = { label: string; why: string; on: boolean; onPick: () => void };

/** A proposed moment: a card, selected with the action ring and a check. */
function SlotCard({ label, why, on, onPick }: SlotProps) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      data-variant="inset"
      className={cx(
        "surface select-anim press flex min-h-16 items-center gap-3 border-0 px-4 py-2 text-left text-ink",
        on && "bg-action-wash shadow-ring",
      )}
    >
      <span className="flex flex-1 flex-col">
        <span className="t-strong">{label}</span>
        <span className="t-cap">{why}</span>
      </span>
      <span
        className={cx(
          "select-anim flex size-6 flex-none items-center justify-center rounded-full text-on-color",
          on ? "bg-action" : "shadow-ring-quiet",
        )}
      >
        {on && <Icon name="check" size={14} stroke={3} />}
      </span>
    </button>
  );
}
