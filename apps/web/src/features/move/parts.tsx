import type { Run } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, relativeMoment } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { SessionChip, SessionShape } from "../../ui/SessionShape.tsx";
import { Surface } from "../../ui/Surface.tsx";

/** The session that moves: its type, when it was planned, and its shape. Its content does not change. */
export function SessionBanner({ run, today }: { run: Run; today: string }) {
  return (
    <Surface variant="inset" className="flex items-center gap-3 px-4 py-3">
      <span className="flex min-w-0 flex-1 flex-col gap-1.5">
        <SessionChip tone={run.intensity}>
          {run.title} · {duration(run.durationMin)}
        </SessionChip>
        <span className="t-cap">Prévu {relativeMoment(run.date, run.start, today).toLowerCase()}</span>
      </span>
      <SessionShape steps={run.steps} tone={run.intensity} className="w-20 flex-none" />
    </Surface>
  );
}

type SlotProps = { label: string; why: string; on: boolean; onPick: () => void };

/** A proposed moment: a card, selected with the action ring and a check. */
export function SlotCard({ label, why, on, onPick }: SlotProps) {
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

/** What else the move changes, said before she validates. */
export function Consequence({ text }: { text: string }) {
  return (
    <p className="t-cap m-0 flex items-start gap-1.5 px-1">
      <Icon name="move" size={16} className="mt-px flex-none" />
      {text}
    </p>
  );
}
