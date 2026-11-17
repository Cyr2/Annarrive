import {
  type PlannedSession,
  plannedSessionSchema,
  type WatchStatus,
  type WorkoutRequest,
  type WorkoutStep,
} from "@annarrive/protocol";
import { addDays, dateOf } from "../time.ts";

type Step = PlannedSession["steps"][number];
type RequestStep = WorkoutRequest["steps"][number];

export const workoutNames: Record<PlannedSession["type"], string> = {
  E: "Footing",
  RECUP: "Récupération",
  L: "Sortie longue",
  T: "Seuil",
  CRUISE: "Seuil fractionné",
  I: "Fractionné",
  R: "Vitesse",
  SPE: "Allure course",
  COTES_C: "Côtes courtes",
  COTES_L: "Côtes longues",
  FARTLEK: "Fartlek",
  TEST: "Test",
  RACE: "Course",
};

const garminKinds: Record<Step["kind"], WorkoutStep["kind"]> = {
  warmup: "warmup",
  work: "interval",
  strides: "interval",
  hills: "interval",
  recover: "recovery",
  cooldown: "cooldown",
};

function toGarminStep(step: Step): WorkoutStep {
  // Distance wins when both are given: the watch then ends the step at the right place.
  if (!step.distM && !step.durMin) throw new Error("Étape sans durée ni distance : la montre ne saurait pas la finir");
  const end = step.distM ? { distanceM: step.distM } : { durationS: Math.round((step.durMin ?? 0) * 60) };
  const pace = step.target.paceSKm;
  if (!pace) return { kind: garminKinds[step.kind], ...end };
  const [a, b] = pace;
  return {
    kind: garminKinds[step.kind],
    ...end,
    pace: { slowMps: 1000 / Math.max(a, b), fastMps: 1000 / Math.min(a, b) },
  };
}

/**
 * The bridge request for a planned session. A repeated step takes the recovery that follows it
 * into its repeat block ("4 × 5 min T, récup 1 min" in algo.md); a session without steps is one
 * open run of its duration.
 */
export function toWorkoutRequest(session: PlannedSession): WorkoutRequest {
  const steps: RequestStep[] = [];
  for (let i = 0; i < session.steps.length; i++) {
    const step = session.steps[i];
    if (!step) continue;
    const reps = step.reps ?? 1;
    if (reps <= 1) {
      steps.push(toGarminStep(step));
      continue;
    }
    const next = session.steps[i + 1];
    const block = [toGarminStep(step)];
    if (next?.kind === "recover") {
      block.push(toGarminStep(next));
      i++;
    }
    steps.push({ kind: "repeat", iterations: reps, steps: block });
  }
  if (steps.length === 0) steps.push({ kind: "interval", durationS: session.durMin * 60 });
  return { name: workoutNames[session.type], date: dateOf(session.start), steps };
}

/** What makes an upload stale: the watch shows the day and the steps, not the hour. */
export function workoutHash(session: PlannedSession): string {
  return JSON.stringify([session.type, dateOf(session.start), session.durMin, session.steps]);
}

/** Planned sessions from today to 6 days ahead live on the watch. */
export function onWatch(session: PlannedSession, today: string): boolean {
  const day = dateOf(session.start);
  return session.status === "planned" && day >= today && day < addDays(today, 7);
}

/** True when a change adds, edits or removes a session the watch holds or should hold. */
export function touchesWatch(mutations: { table: string; before: unknown; after: unknown }[], today: string): boolean {
  return mutations.some(
    (m) =>
      m.table === "planned_session" &&
      [m.before, m.after].some((doc) => {
        const parsed = plannedSessionSchema.safeParse(doc);
        return parsed.success && dateOf(parsed.data.start) >= today && dateOf(parsed.data.start) < addDays(today, 7);
      }),
  );
}

/** Meta key: since when the watch syncs fail, absent once one succeeds (services/garmin.ts). */
export const WATCH_FAILING_SINCE = "watch.failingSince";
/** How long a session may wait for a failing sync before the app says "Pas envoyée" instead of "Envoi…". */
export const WATCH_GIVE_UP_MS = 10 * 60_000;

/** The server's link to the watch: none (no bridge), working, or failing for longer than WATCH_GIVE_UP_MS. */
export type WatchLink = "off" | "ok" | "stalled";

export function watchLink(configured: boolean, failingSince: string | undefined, now: Date): WatchLink {
  if (!configured) return "off";
  const stalled = failingSince && now.getTime() - new Date(failingSince).getTime() >= WATCH_GIVE_UP_MS;
  return stalled ? "stalled" : "ok";
}

/**
 * "pending" until the content on the watch matches the session, then the last upload's outcome. Never pending
 * for good: without a bridge it is "off", and after a long failing spell it is "failed" (with Réessayer).
 */
export function watchStatus(
  session: PlannedSession,
  sync: { status: "sent" | "failed" | "off"; hash: string } | undefined,
  today: string,
  link: WatchLink = "ok",
): WatchStatus | null {
  if (!onWatch(session, today)) return null;
  if (sync?.hash === workoutHash(session)) return sync.status;
  if (link === "off") return "off";
  return link === "stalled" ? "failed" : "pending";
}
