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
  "proposal:RC14": "Même allure au seuil, cœur plus bas",
  "proposal:RC15": "Allure seuil courue sous ta FC seuil",
  "proposal:F10": "Une course récente au-dessus de ton niveau",
};

/** « 14 octobre ». */
const dayMonth = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * The run a measured level was read on, by its day: « Ta sortie du 14 octobre » for a training run (a tempo's laps),
 * « Ta compétition du 12 avril » for a race, so she never takes it for her last race (audit parcours réel F1).
 */
function reason(stores: Stores, source: string): string {
  const effort = /^(?:effort|floor):(.+?)(:detrained)?$/.exec(source);
  if (!effort) return REASONS[source] ?? "Niveau mis à jour";
  const run = stores.activity.get(effort[1] ?? "");
  const what = run
    ? `${run.isRace ? "Ta compétition" : "Ta sortie"} du ${dayMonth(dateOf(run.start))}`
    : "Une sortie récente";
  return effort[2] ? `${what}, moins la coupure` : what;
}

/** « Ton dernier chrono : temps estimé 1:53:30. », « Seuil et fractionné plus rapides que prévu : footing à 6'01 /km au lieu de 6'08 /km. » */
function line(stores: Stores, change: coach.LevelChange): string {
  const why = reason(stores, change.source);
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
      .map((c) => ({ date: c.date, start: c.easyFrom === undefined, line: line(stores, c) }))
      .reverse(),
  };
}
