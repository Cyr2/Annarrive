import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { createApp } from "../app.ts";
import { coachAdapter } from "../coach-adapter.ts";
import { hash, SESSION_SECONDS } from "../services/auth.ts";
import { createServices } from "../services/index.ts";
import { openDatabase } from "../storage/db.ts";
import { createStores } from "../storage/stores.ts";
import { addDays, dateOf, systemClock, toParisLocal } from "../time.ts";

/**
 * Lighthouse CI only (lighthouserc.mjs): the real server and the built PWA over a throwaway database holding one
 * onboarded runner, so the audit measures the first screen with its data. The session is a regular one, put
 * straight in the empty database: nothing here can open a session on a real one.
 */
const env = z
  .object({
    SESSION_SECRET: z.string().min(32),
    LIGHTHOUSE_SESSION: z.string().min(32),
    PORT: z.coerce.number().int().positive(),
    WEB_DIST: z.string(),
  })
  .parse(process.env);

const db = openDatabase(mkdtempSync(join(tmpdir(), "annarrive-lighthouse-")));
const services = createServices({
  db,
  clock: systemClock,
  publicUrl: `http://localhost:${env.PORT}`,
  coach: coachAdapter,
  fetchIcs: async () => "",
});

const today = dateOf(toParisLocal(systemClock()));
services.plan.updateProgram({
  goal: { distanceM: 10000, date: addDays(today, 70), targetMin: 55 },
  declaredTime: { distanceM: 10000, minutes: 58 },
});
services.plan.updateProfile({
  runsPerWeek: 4,
  earliest: "07:00",
  latestEnd: "21:00",
  noRunDays: [],
  bedtime: "23:00",
  useSleepHr: false,
  travelMin: 10,
  cycleTracking: false,
});
createStores(db).authSession.put({
  id: hash(env.LIGHTHOUSE_SESSION),
  expiresAt: new Date(Date.now() + SESSION_SECONDS * 1000).toISOString(),
});

const app = createApp({ services, sessionSecret: env.SESSION_SECRET, webDist: env.WEB_DIST });
serve({ fetch: app.fetch, port: env.PORT }, (info) => console.info(`Lighthouse : serveur prêt (listen ${info.port})`));
