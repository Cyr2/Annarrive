import type { Program } from "../../api/schemas.ts";
import { daysBetween } from "../../lib/date.ts";
import type { SkyPhase } from "../../ui/Sky.tsx";

// Apart from program.ts: the first screen reads it, and must not pull the timetable link's schema.
const SKY: Record<string, SkyPhase> = { Base: "base", Développement: "build", Spécifique: "peak", Affûtage: "race" };

/** The sky warms with the plan: base at dawn, race week in full sun. */
export function skyPhase(program: Program | undefined, today: string | undefined): SkyPhase {
  if (!program || program.maintenance) return "base";
  if (today && daysBetween(today, program.goal.date) <= 7) return "race";
  let start = 1;
  for (const phase of program.phases) {
    if (program.weekIndex >= start && program.weekIndex < start + phase.weeks) return SKY[phase.name] ?? "base";
    start += phase.weeks;
  }
  return "base";
}
