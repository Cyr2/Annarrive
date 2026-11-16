import { useState } from "react";
import type { MoveOptions, Run, Slot } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, mondayOf, relativeMoment } from "../../lib/date.ts";
import { Button } from "../../ui/Button.tsx";
import { IconTile } from "../../ui/bits.tsx";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TONES } from "../../ui/tones.ts";
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
  if (!run) return null;
  return (
    <Sheet {...sheet} title="Déplacer">
      <SessionBanner run={run} today={todayOf(plan)} />
      {options === undefined && <p className="t-cap m-0 px-4">Reggie cherche les bons créneaux…</p>}
      {options === null && (
        <p className="t-cap m-0 px-4">Impossible de charger les créneaux. Réessaie dans un instant.</p>
      )}
      {options && (
        <MoveChoices run={run} options={options} today={todayOf(plan)} close={() => sheet.onOpenChange(false)} />
      )}
    </Sheet>
  );
}

function SessionBanner({ run, today }: { run: Run; today: string }) {
  const tone = TONES[run.intensity];
  return (
    <div className={cx("flex items-center gap-3 rounded-row px-4 py-3", tone.wash)}>
      <IconTile tone={run.intensity} />
      <span className="flex flex-1 flex-col">
        <span className={cx("t-strong", tone.deep)}>
          {run.title} · {duration(run.durationMin)}
        </span>
        <span className={cx("t-cap", tone.ink)}>Prévu {relativeMoment(run.date, run.start, today).toLowerCase()}</span>
      </span>
    </div>
  );
}

type ChoicesProps = { run: Run; options: MoveOptions; today: string; close: () => void };

function MoveChoices({ run, options, today, close }: ChoicesProps) {
  const apply = usePlan((s) => s.apply);
  const [picked, setPicked] = useState<Slot | undefined>(options.slots[0]);
  const [free, setFree] = useState(false);
  const act = async (action: Parameters<typeof apply>[0]) => {
    if (await apply(action)) close();
  };

  if (options.slots.length === 0 && !free) {
    return (
      <>
        <p className="t-body m-0 rounded-row bg-surface px-4 py-3">Aucun créneau ne respecte ton plan cette semaine.</p>
        <Button onClick={() => void act((api) => api.change(run.id, "jog"))}>Remplacer par un footing ce soir</Button>
        <Button variant="tinted" onClick={() => void act((api) => api.skip(run.id))}>
          Passer cette séance
        </Button>
      </>
    );
  }

  return (
    <>
      <ChoiceGroup label="Créneaux proposés" className="flex flex-col gap-2">
        <h2 id="slots-title" className="t-cap m-0 px-4">
          Créneaux proposés
        </h2>
        {options.slots.map((slot) => {
          const on = !free && picked?.date === slot.date && picked.start === slot.start;
          return (
            <button
              key={`${slot.date}-${slot.start}`}
              type="button"
              aria-pressed={on}
              onClick={() => {
                setFree(false);
                setPicked(slot);
              }}
              className={cx(
                "select-anim press flex min-h-16 items-center gap-3 rounded-row border-0 bg-surface px-4 py-2 text-left text-text",
                on && "shadow-ring",
              )}
            >
              <span className="flex flex-1 flex-col">
                <span className="t-strong">{relativeMoment(slot.date, slot.start, today)}</span>
                <span className="t-cap">{slot.why}</span>
              </span>
              <span
                className={cx(
                  "select-anim flex size-6 flex-none items-center justify-center rounded-full text-on-accent",
                  on ? "bg-assistant" : "shadow-ring-quiet",
                )}
              >
                {on && <Icon name="check" size={14} stroke={3} />}
              </span>
            </button>
          );
        })}
      </ChoiceGroup>
      <SlotPicker
        open={free}
        onOpen={() => setFree(true)}
        monday={mondayOf(run.date)}
        options={options}
        today={today}
        value={free ? picked : undefined}
        onChange={setPicked}
        defaultStart={run.start}
      />
      {picked && <p className="t-cap m-0 px-4">{consequenceOf(picked, options)}</p>}
      <Button disabled={!picked} onClick={() => picked && void act((api) => api.move(run.id, picked))}>
        {picked ? `Déplacer à ${shortMoment(picked, today)}` : "Choisis un moment"}
      </Button>
    </>
  );
}
