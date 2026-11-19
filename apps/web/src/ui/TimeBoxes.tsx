type BoxProps = { label: string; unit: string; value: number; max: number; onChange: (value: number) => void };

/** One part of the time, typed on the iPhone's number pad: a big figure and its unit, in glass. */
function TimeBox({ label, unit, value, max, onChange }: BoxProps) {
  return (
    <label
      data-variant="inset"
      className="surface flex min-w-0 flex-1 items-baseline justify-center gap-0.5 px-4 py-3 field-ring"
    >
      <input
        aria-label={label}
        inputMode="numeric"
        maxLength={2}
        placeholder="0"
        value={value ? String(value) : ""}
        onChange={(e) => onChange(Math.min(max, Number(e.target.value.replace(/\D/g, "") || 0)))}
        // As wide as its digits (tabular, one `ch` each) plus room for the last one's overhang: the figure and its
        // unit sit centered together, and no digit is ever clipped.
        style={{ width: `calc(${Math.max(1, String(value || 0).length)}ch + 0.15em)` }}
        // Padding and an equal negative margin: the box (and so the hit area) reaches the label, the layout does not move.
        className="t-figure -mx-4 -my-3 box-content min-w-0 max-w-full border-0 bg-transparent px-4 py-3 text-center text-ink tabular-nums outline-none"
      />
      <span aria-hidden="true" className="t-strong flex-none text-ink-2">
        {unit}
      </span>
    </label>
  );
}

type Props = { seconds: number; onChange: (seconds: number) => void; maxHours?: number };

/** A target time in two boxes, « h » and « min », typed on the number pad. Seconds are dropped. */
export function TimeBoxes({ seconds, onChange, maxHours = 9 }: Props) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return (
    <div className="flex gap-3">
      <TimeBox
        label="Heures"
        unit="h"
        max={maxHours}
        value={hours}
        onChange={(h) => onChange(h * 3600 + minutes * 60)}
      />
      <TimeBox label="Minutes" unit="min" max={59} value={minutes} onChange={(m) => onChange(hours * 3600 + m * 60)} />
    </div>
  );
}
