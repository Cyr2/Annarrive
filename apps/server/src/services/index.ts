import type { DatabaseSync } from "node:sqlite";
import type { CoachPort } from "../coach-port.ts";
import { createStores } from "../storage/stores.ts";
import type { Clock } from "../time.ts";
import { AuthService } from "./auth.ts";
import { ChangeService } from "./changes.ts";
import { PlanService } from "./plan.ts";
import { TimetableService } from "./timetable.ts";

export type Services = { auth: AuthService; changes: ChangeService; plan: PlanService; timetable: TimetableService };

export function createServices(deps: {
  db: DatabaseSync;
  clock: Clock;
  coach: CoachPort;
  fetchIcs: () => Promise<string>;
}): Services {
  const stores = createStores(deps.db);
  const changes = new ChangeService(deps.db, stores, deps.clock);
  const plan = new PlanService(stores, changes, deps.coach, deps.clock);
  return {
    auth: new AuthService(stores, deps.clock),
    changes,
    plan,
    timetable: new TimetableService(deps.db, stores, plan, deps.clock, deps.fetchIcs),
  };
}
