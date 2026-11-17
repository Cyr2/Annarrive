import { type KeyboardEvent, useLayoutEffect, useRef } from "react";

/** Height of one line of a wheel (px): a 44 px target, five lines visible. */
const LINE = 44;
const VISIBLE = 5;
const PAD = ((VISIBLE - 1) / 2) * LINE;
// Lines fade toward the edges, as on the iOS wheel (a mask: only its alpha counts).
const FADE = "linear-gradient(to bottom, transparent, #000 32%, #000 68%, transparent)";

type WheelProps = { label: string; unit: string; max: number; value: number; onChange: (value: number) => void };

/**
 * One iOS-like wheel: a scroll-snapped column, the picked line in a band at the middle, the others fading out.
 * VoiceOver and the keyboard see a spinbutton (arrows up and down); a tap on a line scrolls to it.
 */
function Wheel({ label, unit, max, value, onChange }: WheelProps) {
  const box = useRef<HTMLDivElement>(null);
  const emitted = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A value from outside (keyboard, a reset) moves the wheel; one the wheel just sent does not, or it would
  // cut the momentum of her flick.
  useLayoutEffect(() => {
    if (box.current && value !== emitted.current) box.current.scrollTop = value * LINE;
    emitted.current = value;
  }, [value]);
  useLayoutEffect(() => {
    if (box.current) box.current.scrollTop = emitted.current * LINE;
  }, []);

  const settle = () => {
    clearTimeout(timer.current);
    // Safari has no scrollend before iOS 26: read the line once the scroll has rested.
    timer.current = setTimeout(() => {
      const top = box.current?.scrollTop ?? 0;
      const next = Math.min(max, Math.max(0, Math.round(top / LINE)));
      if (next !== emitted.current) {
        emitted.current = next;
        onChange(next);
      }
    }, 90);
  };
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    onChange(Math.min(max, Math.max(0, value + step)));
  };
  const lines = Array.from({ length: max + 1 }, (_, i) => i);

  return (
    <div className="relative min-w-0 flex-1">
      <div
        ref={box}
        role="spinbutton"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={`${value} ${label.toLowerCase()}`}
        onScroll={settle}
        onKeyDown={onKey}
        className="relative z-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-y snap-mandatory overflow-y-auto overscroll-contain rounded-row outline-none focus-visible:outline-2 focus-visible:outline-action"
        style={{ height: LINE * VISIBLE, paddingBlock: PAD, maskImage: FADE, WebkitMaskImage: FADE }}
      >
        {lines.map((n) => (
          <button
            key={n}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={() => box.current?.scrollTo({ top: n * LINE, behavior: "smooth" })}
            className="t-title flex w-full snap-center items-center justify-center border-0 bg-transparent py-0 pr-8 pl-0 text-ink tabular-nums"
            style={{ height: LINE }}
          >
            {unit === "h" ? n : String(n).padStart(2, "0")}
          </button>
        ))}
      </div>
      <span
        aria-hidden="true"
        className="t-sub pointer-events-none absolute right-2 z-10 flex items-center"
        style={{ top: PAD, height: LINE }}
      >
        {unit}
      </span>
    </div>
  );
}

type Props = { seconds: number; onChange: (seconds: number) => void; maxHours?: number };

/** A duration picked on three wheels: hours, minutes, seconds (the target time she chooses herself). */
export function TimeWheels({ seconds, onChange, maxHours = 9 }: Props) {
  // Two wheels can come to rest in the same frame: each change builds on the other's, not on a stale render.
  const latest = useRef(seconds);
  latest.current = seconds;
  const parts = (total: number) => [Math.floor(total / 3600), Math.floor(total / 60) % 60, total % 60] as const;
  const [h, m, s] = parts(seconds);
  const set = (index: 0 | 1 | 2, v: number) => {
    const next = [...parts(latest.current)];
    next[index] = v;
    latest.current = (next[0] ?? 0) * 3600 + (next[1] ?? 0) * 60 + (next[2] ?? 0);
    onChange(latest.current);
  };
  return (
    <div className="relative flex gap-1">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 rounded-row bg-fill"
        style={{ top: PAD, height: LINE }}
      />
      <Wheel label="Heures" unit="h" max={maxHours} value={h} onChange={(v) => set(0, v)} />
      <Wheel label="Minutes" unit="min" max={59} value={m} onChange={(v) => set(1, v)} />
      <Wheel label="Secondes" unit="s" max={59} value={s} onChange={(v) => set(2, v)} />
    </div>
  );
}
