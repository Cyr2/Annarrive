import { coachAdapter } from "../../apps/server/src/coach-adapter.ts";
import { createServices } from "../../apps/server/src/services/index.ts";
import { icsFetcher } from "../../apps/server/src/services/timetable.ts";
import { openDatabase } from "../../apps/server/src/storage/db.ts";
import { createStores } from "../../apps/server/src/storage/stores.ts";
import { addDays, dateOf, systemClock, toParisLocal } from "../../apps/server/src/time.ts";
import { icsUrl } from "./server.ts";

/**
 * Run before the server starts, with `server-hooks.ts` preloaded (fixed clock, local timetable feed).
 * `garmin`: only what the bridge would have synced, so onboarding starts from an empty plan.
 * `plan`: Anna after onboarding: a semi-marathon, her timetable, legs on Thursday, two weeks of runs.
 */
const [dataDir, mode] = process.argv.slice(2);
if (!dataDir || (mode !== "garmin" && mode !== "plan")) throw new Error("Usage : seed.ts <DATA_DIR> garmin|plan");

const db = openDatabase(dataDir);
const today = dateOf(toParisLocal(systemClock()));
// Without a run, a Garmin VO2max is the level the first week is built on (algo.md F10 c).
createStores(db).dailySignal.put({ id: addDays(today, -1), vo2max: 44, rhr: 52, sleepMin: 450 });

if (mode === "plan") {
  const services = createServices({
    db,
    clock: systemClock,
    publicUrl: "http://localhost",
    coach: coachAdapter,
    fetchIcs: icsFetcher(),
    reggie: async function* () {},
  });
  // Her evenings only, so today's run is still ahead at 8:00 and no morning decision freezes it yet.
  services.plan.updateProfile({
    runsPerWeek: 3,
    earliest: "17:00",
    latestEnd: "21:30",
    noRunDays: [],
    bedtime: "23:00",
    useSleepHr: true,
    travelMin: 0,
    cycleTracking: false,
  });
  services.plan.updateProgram({ goal: { distanceM: 21097.5, date: "2027-03-14" } });
  services.plan.createEvent({
    kind: "strength",
    title: "Jambes",
    start: "2026-11-19T19:00",
    end: "2026-11-19T20:00",
    legs: true,
    recurrence: "weekly",
  });
  await services.timetable.setUrl(icsUrl("timetable.ics"));
}
db.close();
