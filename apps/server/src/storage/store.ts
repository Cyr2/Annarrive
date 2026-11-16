import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { TableName } from "./db.ts";

const rowSchema = z.object({ data: z.string() });
type Span = [start: string | null, end: string | null];

/** A repository over one table; every read is validated again, since the file can outlive the code. */
export class DocumentStore<T extends { id: string }> {
  readonly #db: DatabaseSync;
  readonly #schema: z.ZodType<T>;
  readonly #span: (doc: T) => Span;

  constructor(
    db: DatabaseSync,
    readonly table: TableName,
    schema: z.ZodType<T>,
    span: (doc: T) => Span = () => [null, null],
  ) {
    this.#db = db;
    this.#schema = schema;
    this.#span = span;
  }

  get(id: string): T | undefined {
    const row = this.#db.prepare(`SELECT data FROM ${this.table} WHERE id = ?`).get(id);
    return row === undefined ? undefined : this.#parse(row);
  }

  list(): T[] {
    return this.#db
      .prepare(`SELECT data FROM ${this.table} ORDER BY start_at, id`)
      .all()
      .map((row) => this.#parse(row));
  }

  /** Documents whose span intersects [from, to). */
  overlapping(from: string, to: string): T[] {
    return this.#db
      .prepare(`SELECT data FROM ${this.table} WHERE start_at < ? AND end_at > ? ORDER BY start_at, id`)
      .all(to, from)
      .map((row) => this.#parse(row));
  }

  /** Validates, then inserts or replaces; returns the stored document. */
  put(doc: unknown): T {
    const valid = this.#schema.parse(doc);
    const [start, end] = this.#span(valid);
    this.#db
      .prepare(`INSERT OR REPLACE INTO ${this.table} (id, start_at, end_at, data) VALUES (?, ?, ?, ?)`)
      .run(valid.id, start, end, JSON.stringify(valid));
    return valid;
  }

  delete(id: string): void {
    this.#db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }

  #parse(row: unknown): T {
    return this.#schema.parse(JSON.parse(rowSchema.parse(row).data));
  }
}
