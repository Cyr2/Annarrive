import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { NotFoundError, UndoConflictError } from "../errors.ts";
import { transaction } from "../storage/db.ts";
import type { ChangeEntry, PlanTable, Stores } from "../storage/stores.ts";
import type { Clock } from "../time.ts";

/** One document to write; `after: null` deletes it. */
export type PlanWrite = { table: PlanTable; id: string; after: object | null };

type Target = {
  get(id: string): { id: string } | undefined;
  put(doc: unknown): { id: string };
  delete(id: string): void;
};

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** The only way to modify the plan: every write lands in `change_log` with what it replaced, so Annuler is exact. */
export class ChangeService {
  readonly #db: DatabaseSync;
  readonly #stores: Stores;
  readonly #clock: Clock;
  readonly #targets: Record<PlanTable, Target>;
  readonly #listeners: ((entry: ChangeEntry) => void)[] = [];

  constructor(db: DatabaseSync, stores: Stores, clock: Clock) {
    this.#db = db;
    this.#stores = stores;
    this.#clock = clock;
    this.#targets = {
      planned_session: stores.plannedSession,
      calendar_event: stores.calendarEvent,
      profile: stores.profile,
      program: stores.program,
      health: stores.health,
      fitness_estimate: stores.fitnessEstimate,
      proposal: stores.proposal,
    };
  }

  /** Called after each change and each undo, once written. */
  onRecorded(listener: (entry: ChangeEntry) => void): void {
    this.#listeners.push(listener);
  }

  /** Applies the writes atomically; returns null when they change nothing. */
  record(summary: string, writes: PlanWrite[]): ChangeEntry | null {
    return this.#notify(
      transaction(this.#db, () => {
        const mutations = new Map<string, ChangeEntry["mutations"][number]>();
        for (const write of writes) {
          const target = this.#targets[write.table];
          const key = `${write.table}:${write.id}`;
          const before = mutations.get(key)?.before ?? target.get(write.id) ?? null;
          const after = write.after === null ? null : target.put(write.after);
          if (write.after === null) target.delete(write.id);
          mutations.set(key, { table: write.table, id: write.id, before, after });
        }
        const effective = [...mutations.values()].filter((m) => !same(m.before, m.after));
        if (effective.length === 0) return null;
        return this.#stores.changeLog.put({
          id: randomUUID(),
          at: this.#clock().toISOString(),
          summary,
          mutations: effective,
        });
      }),
    );
  }

  /** Restores the exact state before the change, if nothing touched the same documents since. */
  undo(id: string): ChangeEntry {
    return this.#notify(
      transaction(this.#db, () => {
        const entry = this.#stores.changeLog.get(id);
        if (!entry) throw new NotFoundError("Ce changement est introuvable : recharge l'écran.");
        if (entry.undoneAt) throw new UndoConflictError("Ce changement est déjà annulé.");
        if (entry.mutations.some((m) => !same(this.#targets[m.table].get(m.id), m.after))) {
          throw new UndoConflictError("Un changement plus récent touche les mêmes éléments : annule-le d'abord.");
        }
        for (const m of [...entry.mutations].reverse()) {
          const target = this.#targets[m.table];
          if (m.before == null) target.delete(m.id);
          else target.put(m.before);
        }
        return this.#stores.changeLog.put({ ...entry, undoneAt: this.#clock().toISOString() });
      }),
    );
  }

  #notify<T extends ChangeEntry | null>(entry: T): T {
    if (entry) for (const listener of this.#listeners) listener(entry);
    return entry;
  }
}
