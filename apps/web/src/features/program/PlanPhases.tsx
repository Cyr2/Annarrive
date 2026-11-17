import type { Program } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Group, Section } from "../../ui/List.tsx";
import { PHASE_TEXT, phaseBar } from "./program.ts";

/** The plan's phases in order: what each one is for, done ones checked, the current one marked. */
export function PlanPhases({ program }: { program: Program }) {
  if (program.maintenance || program.phases.length === 0) return null;
  let first = 1;
  return (
    <Section title="Les étapes de ton plan">
      <Group>
        <ol className="m-0 list-none p-0">
          {phaseBar(program).map((phase) => {
            const from = first;
            first += phase.weeks;
            const done = program.weekIndex >= first;
            return (
              <li key={phase.name} className="row items-start gap-3 py-3">
                <span
                  className={cx(
                    "mt-0.5 flex size-6 flex-none items-center justify-center rounded-full",
                    done && "bg-action text-on-color",
                    phase.current && "bg-action-wash shadow-ring",
                    !done && !phase.current && "shadow-ring-quiet",
                  )}
                >
                  {done && <Icon name="check" size={14} stroke={3} />}
                  {phase.current && <span className="size-2 rounded-full bg-action" />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={cx("t-body", phase.current && "font-semibold")}>{phase.name}</span>
                    <span className="t-cap flex-none tabular-nums">
                      {phase.weeks > 1 ? `Sem. ${from} à ${first - 1}` : `Sem. ${from}`}
                    </span>
                  </span>
                  {PHASE_TEXT[phase.name] && <span className="t-cap">{PHASE_TEXT[phase.name]}</span>}
                  {phase.current && <span className="sr-only-label">Phase en cours</span>}
                </span>
              </li>
            );
          })}
        </ol>
      </Group>
    </Section>
  );
}
