import type { DatabaseSync } from "node:sqlite";
import type { CoachPort } from "../coach-port.ts";
import type { BridgeClient } from "../garmin/bridge-client.ts";
import { createStores } from "../storage/stores.ts";
import type { Clock } from "../time.ts";
import { AuthService } from "./auth.ts";
import { ChangeService } from "./changes.ts";
import { GarminService } from "./garmin.ts";
import { NotificationService, type PushSender } from "./notifications.ts";
import { PlanService } from "./plan.ts";
import { TimetableService } from "./timetable.ts";

export type Services = {
  auth: AuthService;
  changes: ChangeService;
  plan: PlanService;
  timetable: TimetableService;
  notifications: NotificationService;
  /** Null when the server has no bridge configured (local development). */
  garmin: GarminService | null;
};

export function createServices(deps: {
  db: DatabaseSync;
  clock: Clock;
  coach: CoachPort;
  fetchIcs: () => Promise<string>;
  bridge?: BridgeClient | undefined;
  push?: { send: PushSender; publicKey: string } | undefined;
}): Services {
  const stores = createStores(deps.db);
  const changes = new ChangeService(deps.db, stores, deps.clock);
  const notifications = new NotificationService(stores, deps.push);
  const plan = new PlanService(stores, changes, deps.coach, deps.clock, notifications);
  return {
    auth: new AuthService(stores, deps.clock),
    changes,
    plan,
    timetable: new TimetableService(deps.db, stores, plan, deps.clock, deps.fetchIcs),
    notifications,
    garmin: deps.bridge ? new GarminService(stores, plan, notifications, deps.bridge, deps.clock) : null,
  };
}
