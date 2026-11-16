import { join } from "node:path";
import { serve } from "@hono/node-server";
import { sendNotification, setVapidDetails } from "web-push";
import { createApp } from "./app.ts";
import { coachAdapter } from "./coach-adapter.ts";
import { loadConfig } from "./config.ts";
import { createBridgeClient } from "./garmin/bridge-client.ts";
import { createJobs, Scheduler } from "./scheduler.ts";
import { createServices } from "./services/index.ts";
import { icsFetcher } from "./services/timetable.ts";
import { backupDatabase } from "./storage/backup.ts";
import { openDatabase } from "./storage/db.ts";
import { dateOf, systemClock, toParisLocal } from "./time.ts";

const config = loadConfig(process.env);
const db = openDatabase(config.DATA_DIR);
const { VAPID_PUBLIC_KEY: publicKey, VAPID_PRIVATE_KEY: privateKey } = config;
if (publicKey && privateKey) setVapidDetails(config.PUBLIC_URL, publicKey, privateKey);
const services = createServices({
  db,
  clock: systemClock,
  coach: coachAdapter,
  fetchIcs: icsFetcher(config.ICS_URL),
  bridge:
    config.BRIDGE_URL && config.BRIDGE_SECRET
      ? createBridgeClient({ baseUrl: config.BRIDGE_URL, secret: config.BRIDGE_SECRET })
      : undefined,
  push:
    publicKey && privateKey
      ? { publicKey, send: (subscription, payload) => sendNotification(subscription, payload) }
      : undefined,
});
const app = createApp({ services, sessionSecret: config.SESSION_SECRET, webDist: config.WEB_DIST });

const jobs = createJobs({
  refreshTimetable: () => (config.ICS_URL ? services.timetable.refresh() : undefined),
  syncActivities: () => services.garmin?.syncActivities(),
  syncRecovery: () => services.garmin?.syncRecovery(),
  morningDecision: () => services.plan.morningDecision(),
  buildNextWeek: () => services.plan.buildNextWeek(),
  syncWatch: () => services.garmin?.syncWatch(),
  backup: () => backupDatabase(db, join(config.DATA_DIR, "backups"), dateOf(toParisLocal(systemClock()))),
});
new Scheduler(jobs, systemClock).start();

serve({ fetch: app.fetch, port: config.PORT }, (info) => {
  console.info(`Talaria écoute sur le port ${info.port}`);
});
