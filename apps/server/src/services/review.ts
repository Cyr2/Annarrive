import * as coach from "@annarrive/coach";
import type { RaceResult, WeekReview } from "@annarrive/protocol";
import { toSession } from "../coach-adapter.ts";
import type { Activity, Stores } from "../storage/stores.ts";
import { addDays, addMinutes, type Clock, dateOf, isoWeekOf, mondayOf, toParisLocal, weekdayOf } from "../time.ts";
import { occurrences } from "./calendar.ts";

/** « 2026-W47 »: the week whose review she closed. */
const DISMISSED = "review.dismissed";
/** Sunday from 18:00, when the job builds the next week and tells her it is ready (scheduler.ts). */
const REVIEW_FROM = "18:00";
/** BR4 compares the week's longest run with the 8 weeks before. */
const BEFORE_DAYS = 56;
const CURRENT = "current";

/** Le bilan du dimanche (algo.md BR) and the goal race's result (RR), as Aujourd'hui shows them. */
export class ReviewService {
  readonly #stores: Stores;
  readonly #clock: Clock;

  constructor(stores: Stores, clock: Clock) {
    this.#stores = stores;
    this.#clock = clock;
  }

  /** What Aujourd'hui adds to the day: the review, the race result, or nothing. */
  today(): { review?: WeekReview; race?: RaceResult } {
    const review = this.review();
    const race = this.race();
    return { ...(review ? { review } : {}), ...(race ? { race } : {}) };
  }

  /**
   * BR7: Sunday once the week's last session is over and not before 18:00, then all of Monday, until she closes it.
   * Nothing for a week with no run planned or run.
   */
  review(): WeekReview | undefined {
    const now = this.#now();
    const today = dateOf(now);
    const day = weekdayOf(today);
    if (day !== 7 && day !== 1) return undefined;
    const monday = day === 7 ? mondayOf(today) : addDays(today, -7);
    const week = isoWeekOf(monday);
    if (this.#stores.meta.get(DISMISSED)?.value === week) return undefined;
    const facts = this.#facts(monday);
    if (facts.planned === 0 && facts.minutes === 0) return undefined;
    if (day === 7) {
      const sessions = this.#sessions(monday).filter((s) => s.status !== "cancelled");
      const lastEnd =
        sessions
          .map((s) => addMinutes(s.start, s.durMin))
          .sort()
          .at(-1) ?? "";
      if (now < `${today}T${REVIEW_FROM}` || now < lastEnd) return undefined;
    }
    return { week, monday, ...facts };
  }

  /** « Fermer le bilan »: kept on the server, so it stays closed on reopen and on her other devices. */
  dismiss(week: string): void {
    this.#stores.meta.put({ id: DISMISSED, value: week });
  }

  /** The notification of the Sunday job: the week in numbers, and that the next one is ready. */
  notice(): string {
    const { done, planned } = this.#facts(mondayOf(dateOf(this.#now())));
    return planned > 0
      ? `${done} ${done > 1 ? "courses" : "course"} sur ${planned} cette semaine. La suivante est prête.`
      : "Ta semaine prochaine est prête.";
  }

  /** RR1: the goal race once Garmin sent it, until she chooses a new race or to keep fit (both change the goal). */
  race(): RaceResult | undefined {
    const program = this.#stores.program.get(CURRENT)?.value;
    const goal = program?.goal;
    const today = dateOf(this.#now());
    if (!goal || goal.date > today) return undefined;
    const run = this.#runs(goal.date, addDays(goal.date, 1))
      .filter((a) => coach.isGoalRace(goal, a))
      .at(-1);
    if (!run) return undefined;
    const earlier = this.#runs(addDays(goal.date, -365 * 3), goal.date);
    const report = coach.raceReport(goal, run, coach.previousRace(goal, earlier, program.declaredTime));
    return { ...(goal.name ? { name: goal.name } : {}), date: goal.date, distanceM: goal.distanceM, ...report };
  }

  /** RR1 at the sync: the run Garmin sent is the goal race; marked so the coach finds it once the goal is gone (MA6). */
  isGoalRace(run: Activity): boolean {
    const goal = this.#stores.program.get(CURRENT)?.value.goal;
    return Boolean(goal && coach.isGoalRace(goal, run));
  }

  #facts(monday: string): Omit<WeekReview, "week" | "monday"> {
    const next = addDays(monday, 7);
    const exams = this.#stores.calendarEvent
      .overlapping(`${monday}T00:00`, `${next}T00:00`)
      .flatMap((e) => occurrences(e, monday, next))
      .filter((e) => e.kind === "exam" && !e.cancelled).length;
    return coach.weekReview({
      sessions: this.#sessions(monday).map(toSession),
      runs: this.#runs(monday, next),
      before: this.#runs(addDays(monday, -BEFORE_DAYS), monday),
      exams,
      next: this.#sessions(next).map(toSession),
    });
  }

  #sessions(monday: string) {
    const next = addDays(monday, 7);
    return this.#stores.plannedSession
      .overlapping(`${monday}T00:00`, `${next}T00:00`)
      .filter((s) => dateOf(s.start) >= monday && dateOf(s.start) < next);
  }

  /** The runs that started between the two days. */
  #runs(from: string, to: string): Activity[] {
    return this.#stores.activity
      .overlapping(`${from}T00:00`, `${to}T00:00`)
      .filter((a) => a.start >= `${from}T00:00` && a.start < `${to}T00:00`);
  }

  #now(): string {
    return toParisLocal(this.#clock());
  }
}
