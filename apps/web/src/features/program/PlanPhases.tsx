import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Group, Section } from "../../ui/List.tsx";
import { PHASE_TEXT, phaseBar } from "./program.ts";

/**
 * The plan's phases as a timeline, read only: a line runs through them, blue up to where she is, a dot per
 * phase, the current one haloed and named "En cours". Nothing here is tappable, so nothing looks like a choice.
 */
export function PlanPhases({ program }: { program: Program }) {
  if (program.maintenance || program.phases.length === 0) return null;
  const phases = phaseBar(program);
  let first = 1;
  return (
    <Section title="Les étapes de ton plan">
      <Group>
        <ol className="m-0 list-none py-1 pl-0">
          {phases.map((phase, i) => {
            const from = first;
            first += phase.weeks;
            const done = program.weekIndex >= first;
            return (
              <li key={phase.name} className="relative flex gap-3 px-4 py-3">
                {i < phases.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cx(
                      "absolute top-[23px] -bottom-[23px] left-[25px] w-0.5 rounded-full",
                      done ? "bg-action" : "bg-hairline-strong",
                    )}
                  />
                )}
                <span aria-hidden="true" className="relative flex h-[22px] w-5 flex-none items-center justify-center">
                  <span
                    className={cx(
                      "rounded-full",
                      done && "size-2.5 bg-action",
                      phase.current && "size-3.5 bg-action shadow-[0_0_0_4px_var(--color-action-wash)]",
                      !done && !phase.current && "size-2.5 bg-on-color shadow-ring-quiet",
                    )}
                  />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span className={cx("t-body", phase.current && "font-semibold")}>{phase.name}</span>
                      {phase.current && <span className="t-cap font-semibold text-action">En cours</span>}
                    </span>
                    <span className="t-cap flex-none tabular-nums">
                      {phase.weeks > 1 ? `Sem. ${from} à ${first - 1}` : `Sem. ${from}`}
                    </span>
                  </span>
                  {PHASE_TEXT[phase.name] && <span className="t-cap">{PHASE_TEXT[phase.name]}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </Group>
    </Section>
  );
}
