import * as coach from "@annarrive/coach";
import { type Progression, paceLabel } from "@annarrive/protocol";
import type { CoachPort } from "../coach-port.ts";
import type { Stores } from "../storage/stores.ts";
import { addDays, dateOf } from "../time.ts";
import { clock } from "./level.ts";
import type { PlanService } from "./plan.ts";

/** What set a level, in her words (algo.md PR4): the source `fitness_estimate` keeps. */
const REASONS: Record<string, string> = {
  declared: "Ton dernier chrono",
  garmin_vo2max: "La VO2max de ta montre",
  "proposal:RC1": "Une course plus rapide que ton niveau",
  "proposal:RC2": "Une course plus lente que ton niveau",
  "proposal:RC3": "Seuil et fractionné plus rapides que prévu",
  "proposal:RC4": "Seuil et fractionné plus lents que prévu",
  "proposal:F10": "Une course récente au-dessus de ton niveau",
};

function reason(source: string): string {
  if (source.endsWith(":detrained")) return "Ta meilleure course récente, moins la coupure";
  if (source.startsWith("effort:") || source.startsWith("floor:")) return "Ta meilleure course récente";
  return REASONS[source] ?? "Niveau mis à jour";
}

/** « Ton dernier chrono : temps estimé 1:53:30. », « Seuil et fractionné plus rapides que prévu : footing à 6'01 /km au lieu de 6'08 /km. » */
function line(change: coach.LevelChange): string {
  const why = reason(change.source);
  if (change.easyFrom === undefined) return `${why} : temps estimé ${clock(change.predictedMin)}.`;
  const [from, to] = [paceLabel(change.easyFrom), paceLabel(change.easyTo)];
  return from === to ? `${why}.` : `${why} : footing à ${to} au lieu de ${from}.`;
}

/** Programme's Progression block (algo.md M12): read only, from what is stored. Null without a plan to follow. */
export function progressionOf(stores: Stores, plan: PlanService, port: CoachPort, now: string): Progression {
  const st = plan.coachState();
  const { goal, startedOn } = st.program;
  const program = port.programPlan(st, now);
  if (!goal || !program || !st.fitness) return null;
  const today = dateOf(now);
  const from = startedOn ?? program.firstMonday;
  const levels = stores.fitnessEstimate.list();
  const mondays = program.weeks.map((w) => w.monday);
  const sessions = stores.plannedSession.overlapping(`${program.firstMonday}T00:00`, `${addDays(goal.date, 1)}T00:00`);
  const runs = stores.activity.overlapping(`${program.firstMonday}T00:00`, now);
  const estimates = coach.weeklyEstimates(levels, mondays, goal.distanceM, today);
  return {
    distanceM: goal.distanceM,
    currentMin: coach.predictTime(st.fitness.vdot, goal.distanceM),
    ...(goal.targetMin ? { targetMin: goal.targetMin } : {}),
    raceDate: goal.date,
    weeks: program.weeks.map((w, i) => {
      const estimateMin = estimates[i];
      return {
        monday: w.monday,
        ...(estimateMin ? { estimateMin } : {}),
        ...coach.weekVolume(sessions, runs, w.monday, w.volumeMin),
      };
    }),
    kept: coach.keptRuns(sessions, runs, from),
    changes: coach
      .levelChanges(levels, from, goal.distanceM)
      .map((c) => ({ date: c.date, start: c.easyFrom === undefined, line: line(c) }))
      .reverse(),
  };
}
