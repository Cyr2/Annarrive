import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Surface } from "../../ui/Surface.tsx";
import { phaseBar } from "./program.ts";

// One gradient across the whole plan, from easy green to race coral: each phase shows its own stretch of it.
const FRIEZE = "linear-gradient(90deg, var(--color-easy), var(--color-long) 55%, var(--color-intense))";

/**
 * The plan's phases as one rounded bar, read only: done phases lit, the ones ahead faded, the current one lit up to
 * this week, where a blue dot stands. The only place that names the phase (the goal card gives the week).
 */
export function PlanPhases({ program }: { program: Program }) {
  if (program.maintenance || program.phases.length === 0) return null;
  const phases = phaseBar(program);
  const total = phases.reduce((sum, p) => sum + p.weeks, 0);
  let from = 0;
  const segments = phases.map((phase) => {
    const start = from;
    from += phase.weeks;
    const share = phase.weeks / total;
    // Shifts the shared gradient so this segment shows the part under it (background-position in %).
    const position = share < 1 ? `${(start / total / (1 - share)) * 100}%` : "0%";
    const done = program.weekIndex > from;
    const here = phase.current ? `${((program.weekIndex - start - 0.5) / phase.weeks) * 100}%` : undefined;
    return { ...phase, share, position, done, here };
  });
  return (
    <Surface as="section" aria-label="Les phases de ton plan" className="flex flex-col gap-2 px-5 py-4">
      <div aria-hidden="true" className="flex h-5 items-center gap-1">
        {segments.map((s) => (
          <span key={s.name} className="relative h-3 basis-0" style={{ flexGrow: s.weeks }}>
            <span
              className={cx("absolute inset-0 overflow-hidden rounded-full", !s.done && !s.here && "opacity-35")}
              style={{
                backgroundImage: FRIEZE,
                backgroundSize: `${100 / s.share}% 100%`,
                backgroundPosition: s.position,
              }}
            >
              {s.here && <span className="absolute inset-y-0 right-0 bg-on-color/65" style={{ left: s.here }} />}
            </span>
            {s.here && (
              <span
                className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-action shadow-glow-action ring-[3px] ring-on-color"
                style={{ left: s.here }}
              />
            )}
          </span>
        ))}
      </div>
      <ol className="t-cap m-0 flex list-none justify-between gap-2 p-0">
        {segments.map((s) => (
          <li
            key={s.name}
            aria-current={s.current ? "step" : undefined}
            className={cx("last:text-right", s.current && "font-bold text-ink")}
          >
            {s.name}
          </li>
        ))}
      </ol>
    </Surface>
  );
}
