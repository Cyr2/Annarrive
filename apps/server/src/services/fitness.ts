import { randomUUID } from "node:crypto";
import type { ChangeResponse, Feel, Level, PlannedSession, Progression, Proposal } from "@annarrive/protocol";
import type { CoachPort } from "../coach-port.ts";
import { NotFoundError, ReadOnlyError } from "../errors.ts";
import type { Activity, Stores } from "../storage/stores.ts";
import { addDays, type Clock, dateOf, toParisLocal } from "../time.ts";
import type { ChangeService } from "./changes.ts";
import { levelOf } from "./fitness-level.ts";
import type { PlanService } from "./plan.ts";
import { progressionOf } from "./progression.ts";

const KEY_DAYS = 28;

/** Level proposals (algo.md M8): raised after each run, accepted or declined in one tap, both undoable. */
export class FitnessService {
  readonly #stores: Stores;
  readonly #plan: PlanService;
  readonly #changes: ChangeService;
  readonly #coach: CoachPort;
  readonly #clock: Clock;

  constructor(stores: Stores, plan: PlanService, changes: ChangeService, coach: CoachPort, clock: Clock) {
    this.#stores = stores;
    this.#plan = plan;
    this.#changes = changes;
    this.#coach = coach;
    this.#clock = clock;
  }

  /** Programme's Progression block (algo.md M12). */
  progression(): Progression {
    return progressionOf(this.#stores, this.#plan, this.#coach, this.#now());
  }

  /** Programme's « Ton niveau » (algo.md M13). */
  level(): Level {
    return levelOf(this.#stores, this.#plan, this.#coach, this.#now());
  }

  pending(): Proposal[] {
    const today = dateOf(this.#now());
    return this.#stores.proposal.list().filter((p) => p.status === "pending" && p.expiresOn >= today);
  }

  /** A new run: first level if none yet, else a proposal when it proves another one. */
  afterRun(run: Activity): Proposal | null {
    if (!this.#plan.coachState().fitness) {
      this.#plan.bootstrapFitness();
      return null;
    }
    const session = run.sessionId ? this.#stores.plannedSession.get(run.sessionId) : undefined;
    const state = this.#plan.coachState();
    const past = this.#stores.proposal.list();
    const draft =
      this.#coach.evaluateRun(state, { ...run, isTest: session?.type === "TEST" }, past, this.#now()) ??
      (session ? this.#coach.evaluateKeySessions(state, this.#doneSessions(), past, this.#now()) : null) ??
      this.#coach.evaluateTrends(state, past, this.#now());
    const known = this.pending().some((p) => p.ruleId === draft?.ruleId);
    return draft && !known ? this.#stores.proposal.put({ ...draft, id: randomUUID(), status: "pending" }) : null;
  }

  /** Runs of the last 4 weeks matched to a planned session (the coach keeps those after the last level change). */
  #doneSessions(): { session: PlannedSession; activity: Activity }[] {
    const now = this.#now();
    return this.#stores.activity.overlapping(`${addDays(dateOf(now), -KEY_DAYS)}T00:00`, now).flatMap((activity) => {
      const session = activity.sessionId ? this.#stores.plannedSession.get(activity.sessionId) : undefined;
      return session ? [{ session, activity }] : [];
    });
  }

  /**
   * C3: Anna's "Comment c'était ?" when the watch did not ask. Garmin's own answer wins, so the app never
   * overwrites it; RC5 may then propose a test.
   */
  logFeel(activityId: string, feel: Feel): void {
    const activity = this.#stores.activity.get(activityId);
    // A session she confirmed without a run from the watch takes her answer too, under its own id.
    if (!activity && this.#stores.plannedSession.get(activityId))
      this.#stores.sessionFeel.put({ id: activityId, feel });
    else if (!activity) throw new NotFoundError("Cette course est introuvable : recharge l'écran.");
    else if (activity.feel) throw new ReadOnlyError("Ta montre a déjà noté ton ressenti pour cette course.");
    else this.#stores.activity.put({ ...activity, answeredFeel: feel });
    const draft = this.#coach.evaluateFeels(this.#plan.coachState(), this.#stores.proposal.list(), this.#now());
    const known = this.pending().some((p) => p.ruleId === draft?.ruleId);
    if (draft && !known) this.#stores.proposal.put({ ...draft, id: randomUUID(), status: "pending" });
  }

  accept(id: string): ChangeResponse {
    const proposal = this.#pending(id);
    const before = this.#plan.coachState();
    const result = this.#coach.acceptProposal(before, proposal, this.#now());
    const write = { table: "proposal" as const, id, after: this.#decided(proposal, "accepted") };
    const summary = proposal.kind === "vdot" ? "Allures mises à jour" : "Proposition acceptée";
    return this.#plan.commitResult(summary, [write], before, result);
  }

  decline(id: string): ChangeResponse {
    const entry = this.#changes.record("Proposition refusée", [
      { table: "proposal", id, after: this.#decided(this.#pending(id), "declined") },
    ]);
    return { change: entry && { id: entry.id, summary: entry.summary }, warnings: [] };
  }

  #pending(id: string): Proposal {
    const proposal = this.#stores.proposal.get(id);
    if (!proposal) throw new NotFoundError("Cette proposition est introuvable : recharge l'écran.");
    if (proposal.status !== "pending" || proposal.expiresOn < dateOf(this.#now()))
      throw new ReadOnlyError("Cette proposition n'est plus d'actualité.");
    return proposal;
  }

  #decided(proposal: Proposal, status: "accepted" | "declined"): Proposal {
    return { ...proposal, status, decidedOn: dateOf(this.#now()) };
  }

  #now(): string {
    return toParisLocal(this.#clock());
  }
}
