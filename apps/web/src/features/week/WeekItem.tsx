import { useDraggable } from "@dnd-kit/core";
import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { duration, minutesOf } from "../../lib/date.ts";
import type { Ue } from "../../lib/text.ts";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TONES, type Tone } from "../../ui/tones.ts";
import { LegsTag } from "../add/StrengthList.tsx";
import { useSheet } from "../sheets/store.ts";
import { nameOf, sheetFor, toneOf } from "../today/today.ts";
import { moveOptions } from "../useLoad.ts";

const cancelledOf = (item: Item) => "cancelled" in item && Boolean(item.cancelled);

/** Under the start time: a class or a busy slot ends at a time, anything else lasts. */
function lasts(item: Item): string {
  if (item.kind === "run") return duration(item.durationMin);
  if (item.kind === "class" || item.kind === "busy") return item.end;
  return duration(minutesOf(item.end) - minutesOf(item.start));
}

/**
 * One line of a day on a time column, its own piece of glass. Each kind is told by its style first: a run has its
 * type's color glowing from the corner and a colored runner next to its pace, strength a fine mauve outline and its
 * dumbbell, a revision its teal book, a class its UE pill. Classes stay quiet: the backdrop of her week.
 */
export function ItemRow({ item, lifted = false }: { item: Item; lifted?: boolean }) {
  const tone = toneOf(item);
  const run = item.kind === "run";
  const quiet = item.kind === "class" || item.kind === "busy";
  const cancelled = cancelledOf(item);
  const { title, detail, ue } = nameOf(item);
  const meta = cancelled ? "N'a pas lieu" : run ? item.mainSet : detail;
  return (
    <Surface
      variant="inset"
      className={cx(
        // At 200 % zoom the title drops under its hour instead of breaking mid-word.
        "flex min-h-14 flex-wrap items-center gap-x-3 overflow-hidden rounded-row px-3 py-2 text-left",
        item.kind === "strength" && "event-strength",
        lifted && "week-lift",
      )}
    >
      {run && !cancelled && <RowHalo tone={tone} />}
      <span className="relative flex w-12 min-w-max flex-none flex-col tabular-nums">
        <span className={cx("t-sub", run && "font-semibold text-ink")}>{item.start}</span>
        <span className="t-cap">{lasts(item)}</span>
      </span>
      <span className="relative flex min-w-[9ch] flex-1 flex-col">
        <span
          className={cx(
            "break-words",
            run ? "t-strong" : quiet ? "t-sub text-ink" : "t-body",
            cancelled && "text-ink-2 line-through",
          )}
        >
          {title}
        </span>
        {meta && <span className="t-cap">{meta}</span>}
      </span>
      <RowEnd item={item} ue={ue} />
    </Surface>
  );
}

/** What tells the row's kind, at its end: a class's UE pill, or the kind's chip (and a run's pace). */
function RowEnd({ item, ue }: { item: Item; ue: Ue | undefined }) {
  const run = item.kind === "run";
  return (
    <span className="relative ml-auto flex flex-none items-center gap-2">
      {item.kind === "strength" && item.legs && !/jambe/i.test(item.title) && <LegsTag />}
      {ue ? <UePill ue={ue} /> : item.kind !== "class" && <KindChip tone={toneOf(item)} filled={run} />}
      {run && <PaceValue value={item.pace} className="whitespace-nowrap" />}
    </span>
  );
}

/** A run's color from the top right corner, gone before the middle: the session card's rule, drawn for a row. */
function RowHalo({ tone }: { tone: Tone }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute inset-0 [mask-image:radial-gradient(120%_140%_at_100%_0%,black,transparent_60%)]",
        TONES[tone].wash,
      )}
    />
  );
}

/** The kind's icon in a small disc: a run's filled with its color, the others on their pale wash. */
function KindChip({ tone, filled }: { tone: Tone; filled: boolean }) {
  const style = TONES[tone];
  return (
    <span
      role="img"
      aria-label={style.label}
      className={cx(
        "flex size-7 flex-none items-center justify-center rounded-full",
        filled ? cx(style.mid, "text-on-color") : cx(style.wash, style.deep),
      )}
    >
      <Icon name={style.icon} size={15} stroke={2.2} />
    </span>
  );
}

/** "UE1": the class's teaching unit, in its own soft color. */
function UePill({ ue }: { ue: Ue }) {
  const style = TONES[ue];
  return (
    <span className={cx("t-cap flex-none rounded-full px-2 py-0.5 font-semibold", style.wash, style.deep)}>
      {style.label}
    </span>
  );
}

/** A row that lifts after a 0.3 s press and can be dropped on another day. A tap opens it. */
export function DraggableItem({ item, disabled, past }: { item: Item; disabled: boolean; past: boolean }) {
  const show = useSheet((s) => s.show);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id, disabled });
  return (
    <button
      ref={setNodeRef}
      type="button"
      data-row={item.id}
      {...attributes}
      {...listeners}
      aria-roledescription={disabled ? undefined : "séance déplaçable"}
      // dnd-kit marks a locked row aria-disabled, but a tap still opens it: VoiceOver must not read it as dimmed.
      aria-disabled={false}
      onClick={() => show(sheetFor(item))}
      // The 0.3 s press covers the slots' round trip: the allowed days are known when the session lifts.
      onPointerDown={() => !disabled && item.kind === "run" && moveOptions.start(item.id)}
      className={cx(
        "week-press block w-full touch-manipulation rounded-row border-0 bg-transparent p-0",
        past && "week-past",
        isDragging && "week-ghost",
      )}
    >
      <ItemRow item={item} />
    </button>
  );
}
