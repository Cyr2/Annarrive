import type { Run } from "../../api/schemas.ts";
import { duration, relativeMoment } from "../../lib/date.ts";
import { tidy } from "../../lib/text.ts";
import { ChoiceCard } from "../../ui/ChoiceCard.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { Surface } from "../../ui/Surface.tsx";

/** The session that moves: its type, when it was planned, and its shape. Its content does not change. */
export function SessionBanner({ run, today }: { run: Run; today: string }) {
  return (
    <Surface variant="inset" className="flex flex-wrap items-center gap-3 px-4 py-3">
      <span className="flex min-w-[12ch] flex-1 flex-col gap-1.5">
        <SessionChip tone={run.intensity}>
          {run.title} · {duration(run.durationMin)}
        </SessionChip>
        <span className="t-cap">Prévu {relativeMoment(run.date, run.start, today).toLowerCase()}</span>
      </span>
      <SessionShape steps={run.steps} tone={run.intensity} className="w-20 flex-none" />
    </Surface>
  );
}

/** Three slot cards' place while Reggie looks for them, so the sheet rises once, at its final height. */
export function SlotsWaiting() {
  return (
    <div className="flex flex-col gap-2">
      <p className="t-cap m-0 px-4">Reggie cherche les bons créneaux…</p>
      <Skeleton label="Recherche des créneaux" className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="h-16" />
      <Skeleton className="mt-3 h-13" />
    </div>
  );
}

type SlotProps = { label: string; why: string; on: boolean; onPick: () => void };

/** A proposed moment: a choice card. */
export function SlotCard({ label, why, on, onPick }: SlotProps) {
  return (
    <ChoiceCard on={on} onClick={onPick} className="min-h-16 py-2">
      <span className="flex flex-1 flex-col">
        <span className="t-strong">{label}</span>
        <span className="t-cap">{tidy(why)}</span>
      </span>
    </ChoiceCard>
  );
}

/** What else the move changes, said before she validates. */
export function Consequence({ text }: { text: string }) {
  return (
    <p className="t-cap m-0 flex items-start gap-1.5 px-1">
      <Icon name="move" size={16} className="mt-px flex-none" />
      {text}
    </p>
  );
}
