import { existsSync, mkdirSync, renameSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";

const initialTables = [
  "profile",
  "program",
  "planned_session",
  "calendar_event",
  "activity",
  "daily_signal",
  "fitness_estimate",
  "change_log",
  "chat_message",
  "push_subscription",
  "auth_session",
  "login_token",
  "meta",
] as const;
export const tableNames = [...initialTables, "watch_sync", "health", "proposal", "app_user", "passkey"] as const;
export type TableName = (typeof tableNames)[number];

// Every table keeps its zod-validated document as JSON, plus the time span it covers for range queries.
const documentTable = (name: string) =>
  `CREATE TABLE ${name} (id TEXT PRIMARY KEY, start_at TEXT, end_at TEXT, data TEXT NOT NULL);
   CREATE INDEX ${name}_start ON ${name} (start_at);`;

/** Append only: a migration that shipped is never edited. */
const migrations: string[] = [
  initialTables.map(documentTable).join("\n"),
  documentTable("watch_sync"),
  documentTable("health"),
  documentTable("proposal"),
  documentTable("app_user") + documentTable("passkey"),
];

/** `:memory:` for tests, otherwise `annarrive.db` inside `dataDir`. */
export function openDatabase(dataDir: string | ":memory:"): DatabaseSync {
  let path = dataDir;
  if (dataDir !== ":memory:") {
    mkdirSync(dataDir, { recursive: true });
    path = join(dataDir, "annarrive.db");
    renameLegacyFile(dataDir, path);
  }
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}

/** The app was called Talaria: its database keeps its data under the new name, with its WAL files. */
function renameLegacyFile(dataDir: string, path: string): void {
  const legacy = join(dataDir, "talaria.db");
  if (!existsSync(legacy) || existsSync(path)) return;
  for (const suffix of ["", "-wal", "-shm"]) {
    if (existsSync(legacy + suffix)) renameSync(legacy + suffix, path + suffix);
  }
}

function migrate(db: DatabaseSync): void {
  const { user_version: current } = z
    .object({ user_version: z.number() })
    .parse(db.prepare("PRAGMA user_version").get());
  migrations.slice(current).forEach((sql, index) => {
    transaction(db, () => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${current + index + 1}`);
    });
  });
}

export function transaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec("BEGIN");
  try {
    const result = work();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
