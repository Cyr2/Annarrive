import { parseArgs } from "node:util";
import * as coach from "@annarrive/coach";
import {
  type GarminActivity,
  type GarminLap,
  paceLabel,
  plannedSessionSchema,
  type WorkoutRequest,
} from "@annarrive/protocol";
import { z } from "zod";
import { fitnessHistory } from "../coach-port.ts";
import type { OwnerBridgeClient } from "../garmin/bridge-client.ts";
import { toWorkoutRequest } from "../garmin/workout.ts";
import { addDays, dateOf } from "../time.ts";
import { toActivity, toLaps } from "./garmin.ts";

/** Every workout this tool creates starts with it; it is the only thing the tool ever lists or deletes. */
export const TEST_PREFIX = "Annarrivé test · ";

const testTypes = ["I", "T", "E", "L"] as const;
const optionsSchema = z.object({
  date: z.iso.date().optional(),
  type: z.enum(testTypes).default("I"),
  vdot: z.coerce.number().min(20).max(85).default(40),
  days: z.coerce.number().int().min(1).max(60).default(7),
});

const USAGE = `Test montre (compte de Darius, jamais celui d'Anna) :
  watch-test.ts send --date AAAA-MM-JJ [--type I|T|E|L] [--vdot 40]   crée et programme une séance
  watch-test.ts delete <id>                                          supprime une séance créée par cet outil
  watch-test.ts list                                                 liste les séances créées par cet outil
  watch-test.ts activities [--days 7]                                courses récentes, tours et lecture F18 (lecture seule)`;

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;
const km = (m: number): string => `${(m / 1000).toFixed(2)} km`;

/** A realistic session from the real catalogue, in the shape the server sends to the watch. */
export function buildTestWorkout(type: (typeof testTypes)[number], vdot: number, date: string): WorkoutRequest {
  const session = coach.buildSession(type, {
    weeklyMin: 240,
    paces: coach.paces(vdot),
    phase: "dev",
    progressionStep: 1,
    distM: 10_000,
    durMin: type === "L" ? 90 : 45,
    // Plain E has no repeat group: sprints give it the warm-up, « Répéter » and cool-down the watch must show.
    sprints: type === "E",
  });
  const planned = plannedSessionSchema.parse({
    ...session,
    id: "watch-test",
    start: `${date}T08:00`,
    status: "planned",
  });
  const request = toWorkoutRequest(planned);
  return { ...request, name: `${TEST_PREFIX}${request.name}` };
}

const KINDS = { warmup: "Échauffement", interval: "Effort", recovery: "Récupération", cooldown: "Retour au calme" };

function describeStep(step: WorkoutRequest["steps"][number], indent = ""): string[] {
  if (step.kind === "repeat")
    return [`${indent}Répéter ${step.iterations} fois`, ...step.steps.flatMap((s) => describeStep(s, `${indent}  `))];
  const end = step.distanceM ? `${step.distanceM} m` : clock(step.durationS ?? 0);
  if (!step.pace) return [`${indent}${KINDS[step.kind]} ${end}`];
  const [fast, slow] = [1000 / step.pace.fastMps, 1000 / step.pace.slowMps];
  const speeds = `${step.pace.slowMps.toFixed(2)} à ${step.pace.fastMps.toFixed(2)} m/s`;
  return [
    `${indent}${KINDS[step.kind]} ${end}, cible ${paceLabel((fast + slow) / 2)}, zone ${paceLabel([fast, slow])} (${speeds})`,
  ];
}

export const describeWorkout = (request: WorkoutRequest): string[] => [
  `${request.name}, le ${request.date}`,
  ...request.steps.flatMap((s) => describeStep(s, "  ")),
];

const isRun = (a: GarminActivity) => a.type?.includes("run") ?? false;
const lapLine = (lap: GarminLap, i: number): string => {
  const pace = lap.distanceM && lap.durationS ? paceLabel((lap.durationS * 1000) / lap.distanceM) : "allure inconnue";
  return `    tour ${i + 1}  ${km(lap.distanceM ?? 0)}  ${clock(lap.durationS ?? 0)}  ${pace}  FC ${lap.avgHr ? Math.round(lap.avgHr) : "?"}`;
};

const READING = {
  race: "effort maximal (race)",
  threshold: "seuil (threshold)",
  training: "plancher (training)",
} as const;

async function activitiesReport(bridge: OwnerBridgeClient, days: number, now: string): Promise<string[]> {
  const since = addDays(dateOf(now), -days);
  const runs = (await bridge.recentActivities(50)).filter((a) => isRun(a) && (a.startTimeLocal ?? "") >= since);
  if (runs.length === 0) return [`Aucune course sur ${days} jours.`];
  const stored = [];
  const lines: string[] = [];
  for (const run of runs) {
    const laps = await bridge.activityLaps(run.id);
    const activity = toActivity(run);
    if (activity) stored.push({ ...activity, laps: toLaps(laps) });
    lines.push(
      `${run.startTimeLocal?.slice(0, 16)}  ${km(run.distanceM ?? 0)}  ${clock(run.durationS ?? 0)}  FC ${run.avgHr ?? "?"} (max ${run.maxHr ?? "?"})`,
      ...laps.map(lapLine),
    );
  }
  // HRmax is the maximum seen in this window only: a lower bound of what the app knows from 12 months of runs.
  const readings = coach.effortReadings(fitnessHistory(stored, undefined, undefined), now);
  lines.push(
    "",
    "Lecture F18 (courses plates, sans séance prévue rattachée) :",
    ...(readings.length === 0
      ? ["  aucun effort lu"]
      : readings.map(
          (r) =>
            `  ${r.start.slice(0, 16)}  ${km(r.distM)} en ${clock(r.durMin * 60)}  ${READING[r.kind]}  VDOT ${r.vdot.toFixed(1)}`,
        )),
  );
  return lines;
}

/** One command of `cli/watch-test.ts`; returns the lines to print. Throws a French message on misuse. */
export async function runWatchTest(argv: string[], bridge: OwnerBridgeClient, now: string): Promise<string[]> {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { date: { type: "string" }, type: { type: "string" }, vdot: { type: "string" }, days: { type: "string" } },
  });
  const [command, arg] = positionals;
  const options = optionsSchema.parse(values);
  if (command === "send") {
    if (!options.date) throw new Error("--date AAAA-MM-JJ est requis");
    const request = buildTestWorkout(options.type, options.vdot, options.date);
    const { workoutId } = await bridge.createWorkout(request);
    return [`Séance envoyée, id ${workoutId}`, ...describeWorkout(request), `Pour la retirer : delete ${workoutId}`];
  }
  if (command === "list") {
    const found = await bridge.listWorkouts(TEST_PREFIX);
    return found.length === 0 ? ["Aucune séance de test."] : found.map((w) => `${w.workoutId}  ${w.name}`);
  }
  if (command === "delete") {
    const id = z.coerce.number().int().positive().parse(arg);
    // The bridge deletes any id: only what carries our prefix is ours to remove.
    if (!(await bridge.listWorkouts(TEST_PREFIX)).some((w) => w.workoutId === id))
      throw new Error(`La séance ${id} n'a pas été créée par cet outil : rien n'est supprimé.`);
    await bridge.deleteWorkout(id);
    return [`Séance ${id} supprimée de Garmin et du calendrier.`];
  }
  if (command === "activities") return activitiesReport(bridge, options.days, now);
  throw new Error(USAGE);
}
