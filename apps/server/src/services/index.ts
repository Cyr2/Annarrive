import type { DatabaseSync } from "node:sqlite";
import { query, startup } from "@anthropic-ai/claude-agent-sdk";
import type { CoachPort } from "../coach-port.ts";
import type { BridgeClient } from "../garmin/bridge-client.ts";
import { touchesWatch } from "../garmin/workout.ts";
import { createReggie, type ReggieRun } from "../reggie/agent.ts";
import { createStores } from "../storage/stores.ts";
import { type Clock, dateOf, toParisLocal } from "../time.ts";
import { AuthService } from "./auth.ts";
import { ChangeService } from "./changes.ts";
import { ChatService } from "./chat.ts";
import { FitnessService } from "./fitness.ts";
import { GarminService } from "./garmin.ts";
import { IncidentService } from "./incidents.ts";
import { NotificationService, type PushSender } from "./notifications.ts";
import { PlanService } from "./plan.ts";
import { ReviewService } from "./review.ts";
import { TimetableService } from "./timetable.ts";

export type Services = {
  auth: AuthService;
  changes: ChangeService;
  plan: PlanService;
  timetable: TimetableService;
  notifications: NotificationService;
  /** Null when the server has no bridge configured (local development). */
  garmin: GarminService | null;
  chat: ChatService;
  fitness: FitnessService;
  incidents: IncidentService;
  review: ReviewService;
};

export function createServices(deps: {
  db: DatabaseSync;
  clock: Clock;
  /** Env `PUBLIC_URL`: its host is the passkeys' site (rpID), its origin the one they answer to. */
  publicUrl: string;
  coach: CoachPort;
  fetchIcs: (url: string) => Promise<string>;
  /** Env `ICS_URL`, used until Anna pastes her own link. */
  icsUrl?: string | undefined;
  bridge?: BridgeClient | undefined;
  push?: { send: PushSender; publicKey: string } | undefined;
  /** Defaults to the Agent SDK; tests pass a fake. */
  reggie?: ReggieRun;
  /** Pause between two Garmin calls of the history backfill; tests pass 0. */
  garminPauseMs?: number;
}): Services {
  const stores = createStores(deps.db);
  const changes = new ChangeService(deps.db, stores, deps.clock);
  const notifications = new NotificationService(stores, deps.push);
  const plan = new PlanService(stores, changes, deps.coach, deps.clock, notifications, Boolean(deps.bridge));
  const fitness = new FitnessService(stores, plan, changes, deps.coach, deps.clock);
  const review = new ReviewService(stores, deps.clock);
  const garmin = deps.bridge
    ? new GarminService(stores, plan, fitness, notifications, deps.bridge, deps.clock, review, deps.garminPauseMs)
    : null;
  // A change reaches the watch within the minute (interactions.md), not at the next 5-minute job.
  changes.onRecorded((entry) => {
    if (!garmin || !touchesWatch(entry.mutations, dateOf(toParisLocal(deps.clock())))) return;
    garmin.syncWatch().catch((error: unknown) => {
      console.error(
        `Montre : synchro immédiate en échec (${error instanceof Error ? error.message : "erreur inconnue"})`,
      );
    });
  });
  const incidents = new IncidentService(stores, deps.clock);
  return {
    auth: new AuthService(stores, deps.clock, deps.publicUrl),
    changes,
    chat: new ChatService(
      stores,
      plan,
      fitness,
      deps.reggie ?? createReggie(query, process.env, startup),
      deps.clock,
      incidents,
    ),
    plan,
    timetable: new TimetableService(deps.db, stores, plan, deps.clock, deps.fetchIcs, deps.icsUrl),
    notifications,
    garmin,
    fitness,
    incidents,
    review,
  };
}
