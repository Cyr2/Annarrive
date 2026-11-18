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

const errorName = (error: unknown) => (error instanceof Error ? error.message : "erreur inconnue");

/** The scheduled Garmin jobs: read runs and recovery, keep the watch calendar in step with the plan. */
export class GarminService {
  readonly #stores: Stores;
  readonly #plan: PlanService;
  readonly #fitness: FitnessService;
  readonly #notifications: NotificationService;
  readonly #bridge: BridgeClient;
  readonly #clock: Clock;
  #syncingWatch = false;
  #syncAgain = false;

  constructor(
    stores: Stores,
    plan: PlanService,
    fitness: FitnessService,
    notifications: NotificationService,
    bridge: BridgeClient,
    clock: Clock,
  ) {
    this.#stores = stores;
    this.#plan = plan;
    this.#fitness = fitness;
    this.#notifications = notifications;
    this.#bridge = bridge;
    this.#clock = clock;
  }

  /** Stores recent runs, marks the planned session each one matches as done, invites a note for today's. */
  async syncActivities(): Promise<void> {
    const today = dateOf(this.#now());
    const runs = (await this.#bridge.recentActivities())
      .filter(isRun)
      .map(toActivity)
      .filter((a) => a !== null)
      .sort((a, b) => a.start.localeCompare(b.start));
    this.#synced();
    for (const run of runs) {
      const stored = this.#stores.activity.get(run.id);
      const sessionId = stored?.sessionId ?? this.#matchingSession(run)?.id;
      const laps = stored?.laps ?? (await this.#laps(run.id));
      this.#stores.activity.put({ ...run, answeredFeel: stored?.answeredFeel, sessionId, laps });
      if (sessionId && !stored?.sessionId) this.#plan.markDone(sessionId);
      if (!stored) this.#fitness.afterRun({ ...run, sessionId });
      if (!stored && dateOf(run.start) === today) await this.#notifications.runSynced();
    }
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
        if (sync.workoutId !== undefined) await this.#bridge.deleteWorkout(sync.workoutId);
        this.#stores.watchSync.delete(sync.id);
      } catch (error) {
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
    return this.#stores.plannedSession
      .overlapping(`${day}T00:00`, `${addDays(day, 1)}T00:00`)
      .filter((s) => dateOf(s.start) === day && s.status === "planned")
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
