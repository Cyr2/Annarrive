import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { passThroughCoach } from "./coach-port.ts";
import { loadConfig } from "./config.ts";
import { createJobs, Scheduler } from "./scheduler.ts";
import { createServices } from "./services/index.ts";
import { icsFetcher } from "./services/timetable.ts";
import { openDatabase } from "./storage/db.ts";
import { systemClock } from "./time.ts";

const config = loadConfig(process.env);
const services = createServices({
  db: openDatabase(config.DATA_DIR),
  clock: systemClock,
  coach: passThroughCoach,
  fetchIcs: icsFetcher(config.ICS_URL),
});
const app = createApp({ services, sessionSecret: config.SESSION_SECRET, webDist: config.WEB_DIST });

const jobs = createJobs({
  refreshTimetable: () => (config.ICS_URL ? services.timetable.refresh() : undefined),
  buildNextWeek: () => services.plan.buildNextWeek(),
});
new Scheduler(jobs, systemClock).start();

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.info(`Talaria écoute sur le port ${info.port}`);
});
