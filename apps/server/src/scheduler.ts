import { type Clock, dateOf, toParisLocal, weekdayOf } from "./time.ts";

/** Paris wall-clock minute a job is checked against. */
export type ParisMinute = { weekday: number; hour: number; minute: number };
export type Job = { name: string; due: (t: ParisMinute) => boolean; run: () => unknown };

/** Polls twice a minute and runs each due job at most once per Paris minute. */
export class Scheduler {
  readonly #jobs: Job[];
  readonly #clock: Clock;
  readonly #lastRun = new Map<string, string>();

  constructor(jobs: Job[], clock: Clock) {
    this.#jobs = jobs;
    this.#clock = clock;
  }

  get jobNames(): string[] {
    return this.#jobs.map((j) => j.name);
  }

  async tick(): Promise<void> {
    const local = toParisLocal(this.#clock());
    const t = {
      weekday: weekdayOf(dateOf(local)),
      hour: Number(local.slice(11, 13)),
      minute: Number(local.slice(14, 16)),
    };
    for (const job of this.#jobs) {
      if (!job.due(t) || this.#lastRun.get(job.name) === local) continue;
      this.#lastRun.set(job.name, local);
      try {
        await job.run();
      } catch (error) {
        console.error(`Tâche « ${job.name} » en échec : ${error instanceof Error ? error.message : "erreur inconnue"}`);
      }
    }
  }

  /** Returns the stop function. */
  start(intervalMs = 30_000): () => void {
    const timer = setInterval(() => void this.tick(), intervalMs);
    return () => clearInterval(timer);
  }
}

/** Every 20 min from 6:00 to 23:00, every 2 h at night (architecture.md, tâches planifiées). */
export const timetableDue = ({ hour, minute }: ParisMinute) =>
  (hour >= 6 && hour < 23 && minute % 20 === 0) || (minute === 0 && (hour === 23 || (hour < 6 && hour % 2 === 0)));

const noop = () => undefined;

export function createJobs(services: {
  refreshTimetable: () => unknown;
  buildNextWeek: () => unknown;
  backup: () => unknown;
}): Job[] {
  return [
    { name: "Emploi du temps", due: timetableDue, run: services.refreshTimetable },
    // TODO step 4 (Garmin): fetch new activities and attach each run to its planned session.
    { name: "Garmin, activités", due: ({ hour, minute }) => hour >= 6 && hour < 23 && minute % 15 === 0, run: noop },
    // TODO step 4 (Garmin): sleep, resting HR, Body Battery, stress; stop polling once the night is in, 10:00 at the latest.
    { name: "Garmin, récupération", due: ({ hour, minute }) => hour >= 5 && hour < 10 && minute % 15 === 0, run: noop },
    // TODO step 4 (Garmin): run readiness.dailyDecision right after recovery, freeze the session, send the watch.
    { name: "Décision du matin", due: ({ hour, minute }) => hour === 10 && minute === 0, run: noop },
    // TODO step 8 (notifications): push « Ta semaine est prête » and send the week to the watch.
    {
      name: "Semaine suivante",
      due: (t) => t.weekday === 7 && t.hour === 18 && t.minute === 0,
      run: services.buildNextWeek,
    },
    // TODO step 4 (Garmin): resend sessions whose watch upload failed.
    { name: "Montre", due: ({ minute }) => minute % 5 === 0, run: noop },
    // 3:30, when nothing else runs: one copy a day, 30 days kept.
    { name: "Sauvegarde", due: ({ hour, minute }) => hour === 3 && minute === 30, run: services.backup },
  ];
}
