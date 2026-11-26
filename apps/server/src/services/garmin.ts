import type { GarminActivity, GarminDailySignals, GarminLap, PlannedSession } from "@annarrive/protocol";
import {
  type BridgeClient,
  BridgeUnreachableError,
  GarminAuthError,
  GarminRateLimitError,
  GarminWriteOffError,
} from "../garmin/bridge-client.ts";
import { onWatch, toWorkoutRequest, WATCH_FAILING_SINCE, workoutHash } from "../garmin/workout.ts";
import type { Activity, Stores } from "../storage/stores.ts";
import { addDays, type Clock, dateOf, toParisLocal } from "../time.ts";
import type { FitnessService } from "./fitness.ts";
import type { NotificationService } from "./notifications.ts";
import type { PlanService } from "./plan.ts";
import type { ReviewService } from "./review.ts";

/** Garmin type keys of a run: running, trail_running, treadmill_running, virtual_run… */
const isRun = (a: GarminActivity) => a.type?.includes("run") ?? false;

/** Garmin's "how did you feel", 0 (very weak) to 100 (very strong), as the app's three answers. */
function feelOf(value: number | null): Activity["feel"] {
  if (value === null) return undefined;
  if (value <= 25) return "hard";
  return value >= 75 ? "easy" : "ok";
}

/** Null when Garmin has not finished processing it (no start or no duration yet). */
export function toActivity(a: GarminActivity): Activity | null {
  if (!a.startTimeLocal || !a.durationS) return null;
  return {
    id: `garmin:${a.id}`,
    // "2026-11-15 07:30:00", already in the watch's local time.
    start: a.startTimeLocal.slice(0, 16).replace(" ", "T"),
    durMin: a.durationS / 60,
    distM: a.distanceM ?? 0,
    avgHr: a.avgHr ?? undefined,
    maxHr: a.maxHr ?? undefined,
    elevGainM: a.elevationGainM ?? undefined,
    feel: feelOf(a.feel),
    // Garmin stores RPE × 10.
    rpe: a.rpe === null ? undefined : a.rpe / 10,
    isRace: a.eventType === "race" || undefined,
  };
}

/** Laps without a time or a distance (a pause, a manual lap pressed twice) say nothing about pace. */
export function toLaps(laps: GarminLap[]): NonNullable<Activity["laps"]> {
  return laps.flatMap((l) =>
    l.durationS && l.distanceM
      ? [{ durMin: l.durationS / 60, distM: l.distanceM, ...(l.avgHr === null ? {} : { avgHr: l.avgHr }) }]
      : [],
  );
}

const minutesApart = (a: string, b: string) => Math.abs(Date.parse(`${a}:00Z`) - Date.parse(`${b}:00Z`)) / 60_000;

/** These failures hit every call alike: the next sessions would fail the same way. */
const stopsSync = (error: unknown) =>
  error instanceof BridgeUnreachableError || error instanceof GarminRateLimitError || error instanceof GarminAuthError;

const LAST_SYNC = "watch.lastSyncAt";
/** Where the history backfill stands: how many activities it has read, newest first, or "done". */
export const BACKFILL = "garmin.backfill";
/** A year of runs: P8 caps the peak by the biggest week of 12 months. */
const BACKFILL_DAYS = 365;
/** Laps of 12 weeks: F18 finds the best efforts in them. */
const LAP_DAYS = 84;
/** Small pages, read one after the other with a pause: Garmin publishes no rate limit. */
const PAGE = 50;

const errorName = (error: unknown) => (error instanceof Error ? error.name : "erreur inconnue");

/** The scheduled Garmin jobs: read runs and recovery, keep the watch calendar in step with the plan. */
export class GarminService {
  readonly #stores: Stores;
  readonly #plan: PlanService;
  readonly #fitness: FitnessService;
  readonly #notifications: NotificationService;
  readonly #bridge: BridgeClient;
  readonly #clock: Clock;
  readonly #review: ReviewService | undefined;
  readonly #pauseMs: number;
  #syncingWatch = false;
  #syncAgain = false;
  #backfilling = false;

  constructor(
    stores: Stores,
    plan: PlanService,
    fitness: FitnessService,
    notifications: NotificationService,
    bridge: BridgeClient,
    clock: Clock,
    review?: ReviewService,
    pauseMs = 2000,
  ) {
    this.#stores = stores;
    this.#plan = plan;
    this.#fitness = fitness;
    this.#notifications = notifications;
    this.#bridge = bridge;
    this.#clock = clock;
    this.#review = review;
    this.#pauseMs = pauseMs;
  }

  /**
   * Stores recent runs, marks the planned session each one matches as done, invites a note for today's.
   * Then reads the year before, once (`#backfill`).
   */
  async syncActivities(): Promise<void> {
    const today = dateOf(this.#now());
    const runs = (await this.#bridge.recentActivities())
      .filter(isRun)
      .map(toActivity)
      .filter((a) => a !== null)
      .sort((a, b) => a.start.localeCompare(b.start));
    this.#synced();
    // A run from before the programme is history: no session to match, nothing to adapt (M10).
    const since = this.#plan.program().startedOn;
    const current = (run: Activity) => !since || dateOf(run.start) >= since;
    const fresh = await this.#storeRecent(runs, current);
    // Only once every run is stored: a first level read mid-sync took the runs not stored yet for a break (F11).
    // Same for the year before: the first level waits for the backfill, whose end reads it.
    const historyRead = this.#stores.meta.get(BACKFILL)?.value === "done";
    for (const run of fresh) {
      if (historyRead || this.#stores.fitnessEstimate.list().length > 0) this.#fitness.afterRun(run);
      // M10: the week follows what she ran (a tempo on an easy day, a run she added).
      if (current(run)) this.#plan.adaptToRun(run);
      if (dateOf(run.start) === today) await this.#notifications.runSynced();
    }
    await this.#backfill();
  }

  /** The runs not stored before, with the session each one matched. */
  async #storeRecent(runs: Activity[], current: (run: Activity) => boolean): Promise<Activity[]> {
    const fresh: Activity[] = [];
    for (const run of runs) {
      const stored = this.#stores.activity.get(run.id);
      const sessionId = stored?.sessionId ?? (current(run) ? this.#matchingSession(run)?.id : undefined);
      const laps = stored?.laps ?? (await this.#laps(run.id));
      // RR1: the goal race, marked once, so the easy weeks after it outlive the goal (MA6).
      const isRace = stored?.isRace ?? (run.isRace || this.#review?.isGoalRace(run) || undefined);
      this.#stores.activity.put({ ...run, answeredFeel: stored?.answeredFeel, setAside: stored?.setAside, sessionId, laps, isRace });
      if (sessionId && !stored?.sessionId) this.#plan.markDone(sessionId);
      if (!stored) fresh.push({ ...run, sessionId, laps, isRace });
    }
    return fresh;
  }

  /**
   * Reads the runs of the last 12 months once, page by page, with laps for the last 12 weeks. Stored as history:
   * no session matched, no adaptation, no note. Stopped by Garmin (429, down), it resumes at the page it was on.
   * Its end reads the first level (F10).
   */
  async #backfill(): Promise<void> {
    const cursor = this.#stores.meta.get(BACKFILL)?.value;
    if (cursor === "done" || this.#backfilling) return;
    this.#backfilling = true;
    const today = dateOf(this.#now());
    let next: number | null = Number(cursor ?? 0);
    try {
      while (next !== null) {
        console.info(`Garmin : historique, lecture à partir de l'activité ${next}`);
        next = await this.#readPage(next, today);
        if (next !== null) await this.#pause();
      }
      this.#stores.meta.put({ id: BACKFILL, value: "done" });
      console.info("Garmin : historique de 12 mois lu");
      // A level onboarding read mid-read saw part of the year: read again with all of it (F10).
      this.#plan.bootstrapFitness(true);
    } catch (error) {
      console.error(`Garmin : historique arrêté, repris à la prochaine synchro (${errorName(error)})`);
    } finally {
      this.#backfilling = false;
    }
  }

  /** Stores one page and moves the cursor past it. The next page's start, or null once a year back is reached. */
  async #readPage(start: number, today: string): Promise<number | null> {
    const from = addDays(today, -BACKFILL_DAYS);
    const page = await this.#bridge.recentActivities(PAGE, start);
    for (const run of page.filter(isRun).map(toActivity)) {
      if (run && dateOf(run.start) >= from) await this.#storeHistory(run, addDays(today, -LAP_DAYS));
    }
    this.#stores.meta.put({ id: BACKFILL, value: String(start + page.length) });
    const oldest = page.at(-1)?.startTimeLocal;
    const done = page.length < PAGE || (oldest !== null && oldest !== undefined && oldest.slice(0, 10) < from);
    return done ? null : start + page.length;
  }

  /** Never overwrites a stored run: it only adds the laps a recent one is missing. */
  async #storeHistory(run: Activity, lapsFrom: string): Promise<void> {
    const stored = this.#stores.activity.get(run.id);
    const recent = dateOf(run.start) >= lapsFrom;
    if (stored && (stored.laps || !recent)) return;
    let laps: Activity["laps"];
    if (recent) {
      await this.#pause();
      laps = await this.#laps(run.id);
    }
    this.#stores.activity.put({ ...run, ...stored, laps });
  }

  #pause(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, this.#pauseMs));
  }

  /** A run's laps, read once; undefined when the bridge fails, so the next sync tries again. */
  async #laps(runId: string): Promise<Activity["laps"]> {
    try {
      return toLaps(await this.#bridge.activityLaps(Number(runId.replace("garmin:", ""))));
    } catch (error) {
      if (stopsSync(error)) throw error;
      return undefined;
    }
  }

  /** Polls until the night's sleep is in, then runs the morning decision right away. */
  async syncRecovery(): Promise<void> {
    const today = dateOf(this.#now());
    if (this.#stores.dailySignal.get(today)?.sleepMin !== undefined) return;
    const signals = await this.#bridge.dailySignals(today);
    this.#storeSignals(signals);
    if (signals.sleepS === null) return;
    // Yesterday's stress average (SG3) is complete only once the day is over.
    this.#storeSignals(await this.#bridge.dailySignals(addDays(today, -1)));
    this.#plan.morningDecision();
  }

  /** Uploads every session of the next 7 days whose content the watch does not have yet. */
  async syncWatch(): Promise<void> {
    // A slow bridge can outlast the 5 min between runs: two syncs at once would upload twice.
    // A change made meanwhile asks for one more pass, so it does not wait for the next job.
    if (this.#syncingWatch) {
      this.#syncAgain = true;
      return;
    }
    this.#syncingWatch = true;
    try {
      do {
        this.#syncAgain = false;
        const today = dateOf(this.#now());
        if (!(await this.#removeStale(today))) return this.#failing();
        // Nothing reaches her watch before onboarding (audit parcours réel B2).
        if (!this.#plan.onboarding().done) return;
        if (await this.#upload(today)) this.#synced();
        else this.#failing();
      } while (this.#syncAgain);
    } finally {
      this.#syncingWatch = false;
    }
  }

  /** Deletes the workouts of sessions gone, cancelled or moved past the 7 days. False when the bridge is down. */
  async #removeStale(today: string): Promise<boolean> {
    for (const sync of this.#stores.watchSync.list()) {
      const session = this.#stores.plannedSession.get(sync.id);
      const kept =
        session &&
        session.status !== "cancelled" &&
        session.status !== "skipped" &&
        dateOf(session.start) < addDays(today, 7);
      if (kept) continue;
      try {
        // Only the workouts the app created: their template goes, and its calendar entry with it.
        if (sync.workoutId !== undefined) {
          await this.#bridge.deleteWorkout(sync.workoutId);
          console.info(`Montre : entraînement ${sync.workoutId} retiré de Garmin (séance ${sync.id})`);
        }
        this.#stores.watchSync.delete(sync.id);
      } catch (error) {
        // Writing switched off: the workout stays tracked and goes once writing is back on.
        if (error instanceof GarminWriteOffError) return true;
        console.error(`Montre : séance retirée non supprimée (${errorName(error)})`);
        if (stopsSync(error)) return false;
      }
    }
    return true;
  }

  /** Last time Garmin answered, for Programme > Montre Garmin. */
  lastSyncAt(): string | null {
    return this.#stores.meta.get(LAST_SYNC)?.value ?? null;
  }

  #synced(): void {
    this.#stores.meta.put({ id: LAST_SYNC, value: this.#clock().toISOString() });
    this.#stores.meta.delete(WATCH_FAILING_SINCE);
  }

  /** The first failed pass of a spell is kept: the app gives up on "Envoi…" some time after it. */
  #failing(): void {
    if (this.#stores.meta.get(WATCH_FAILING_SINCE)) return;
    this.#stores.meta.put({ id: WATCH_FAILING_SINCE, value: this.#clock().toISOString() });
  }

  /** True when every session reached the watch. */
  async #upload(today: string): Promise<boolean> {
    let ok = true;
    const sessions = this.#stores.plannedSession
      .overlapping(`${today}T00:00`, `${addDays(today, 7)}T00:00`)
      .filter((s) => onWatch(s, today));
    for (const session of sessions) {
      const sync = this.#stores.watchSync.get(session.id);
      const hash = workoutHash(session);
      if (sync?.status === "sent" && sync.hash === hash) continue;
      let workoutId = sync?.workoutId;
      try {
        // Garmin cannot edit a scheduled workout: the old one goes, the new one comes.
        if (workoutId !== undefined) await this.#bridge.deleteWorkout(workoutId);
        workoutId = undefined;
        workoutId = (await this.#bridge.createWorkout(toWorkoutRequest(session))).workoutId;
        this.#stores.watchSync.put({ id: session.id, status: "sent", hash, workoutId });
      } catch (error) {
        if (error instanceof GarminWriteOffError) {
          this.#stores.watchSync.put({ id: session.id, status: "off", hash, workoutId });
          continue;
        }
        this.#stores.watchSync.put({ id: session.id, status: "failed", hash, workoutId });
        console.error(`Montre : séance non envoyée (${errorName(error)})`);
        ok = false;
        if (stopsSync(error)) return false;
      }
    }
    return ok;
  }

  /** The planned session of the same day that starts closest to the run. */
  #matchingSession(run: Activity): PlannedSession | undefined {
    const day = dateOf(run.start);
    const next = `${addDays(day, 1)}T00:00`;
    const matched = new Set(this.#stores.activity.overlapping(`${day}T00:00`, next).map((a) => a.sessionId));
    // A session she confirmed with « Oui, je l'ai faite » before her run synced is still that run's (audit 26/11).
    const open = (s: PlannedSession) => s.status === "planned" || (s.status === "done" && !matched.has(s.id));
    return this.#stores.plannedSession
      .overlapping(`${day}T00:00`, next)
      .filter((s) => dateOf(s.start) === day && open(s))
      .sort((a, b) => minutesApart(a.start, run.start) - minutesApart(b.start, run.start))[0];
  }

  /** Keeps what an earlier poll stored when Garmin now leaves a field out. */
  #storeSignals(g: GarminDailySignals): void {
    const fields = {
      rhr: g.restingHr,
      sleepMin: g.sleepS === null ? null : Math.round(g.sleepS / 60),
      bodyBatteryWake: g.bodyBatteryAtWake,
      stressAvg: g.stressAvg,
      vo2max: g.vo2Max,
    };
    const present = Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null));
    this.#stores.dailySignal.put({ ...this.#stores.dailySignal.get(g.date), ...present, id: g.date });
  }

  #now(): string {
    return toParisLocal(this.#clock());
  }
}
