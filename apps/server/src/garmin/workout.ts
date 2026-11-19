import {
  type PlannedSession,
  plannedSessionSchema,
  sessionNames,
  stepBlocks,
  type WatchStatus,
  type WorkoutRequest,
  type WorkoutStep,
} from "@annarrive/protocol";
import { addDays, dateOf } from "../time.ts";

type Step = PlannedSession["steps"][number];
type RequestStep = WorkoutRequest["steps"][number];

const garminKinds: Record<Step["kind"], WorkoutStep["kind"]> = {
  warmup: "warmup",
  work: "interval",
  strides: "interval",
  recover: "recovery",
  cooldown: "cooldown",
};

/**
 * C4: the watch holds a narrow zone around the one target, like Garmin Coach: ±10 s/km on easy steps, ±5 s/km on
 * the others (decision of 19/11/2026).
 */
const zoneHalfWidth = (step: Step): number => (step.zone === "E" ? 10 : 5);

function toGarminStep(step: Step): WorkoutStep {
  // Distance wins when both are given: the watch then ends the step at the right place.
  if (!step.distM && !step.durMin) throw new Error("Étape sans durée ni distance : la montre ne saurait pas la finir");
  const end = step.distM ? { distanceM: step.distM } : { durationS: Math.round((step.durMin ?? 0) * 60) };
  const pace = step.target.paceSKm;
  if (!pace) return { kind: garminKinds[step.kind], ...end };
  const [a, b] = pace;
  const w = zoneHalfWidth(step);
  return {
    kind: garminKinds[step.kind],
    ...end,
    pace: { slowMps: 1000 / (Math.max(a, b) + w), fastMps: 1000 / (Math.min(a, b) - w) },
  };
}

/**
 * The bridge request for a planned session, block for block what the app lists (`stepBlocks`): a repeat group
 * holds its step and the recovery after it ("4 × 5 min T, récup 1 min" in algo.md); a session without steps is
 * one open run of its duration.
 */
export function toWorkoutRequest(session: PlannedSession): WorkoutRequest {
  const steps: RequestStep[] = stepBlocks(session.steps).map((b) =>
    b.kind === "step"
      ? toGarminStep(b.step)
      : { kind: "repeat", iterations: b.times, steps: b.steps.map(toGarminStep) },
  );
  if (steps.length === 0) steps.push({ kind: "interval", durationS: session.durMin * 60 });
  return { name: sessionNames[session.type], date: dateOf(session.start), steps };
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
