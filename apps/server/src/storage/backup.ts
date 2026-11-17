import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";

const KEEP_DAYS = 30;
// Copies made before the rename (talaria-*) age out like the others.
const FILE = /^(?:annarrive|talaria)-(\d{4}-\d{2}-\d{2})\.db$/;

/**
 * Writes a consistent copy of the live database (VACUUM INTO works while the app keeps writing),
 * then deletes copies older than 30 days. Returns the new file's path.
 */
export function backupDatabase(db: DatabaseSync, backupDir: string, day: string): string {
  mkdirSync(backupDir, { recursive: true });
  const target = join(backupDir, `annarrive-${day}.db`);
  // VACUUM INTO refuses an existing file: a second run the same day replaces the copy.
  rmSync(target, { force: true });
  db.prepare("VACUUM INTO ?").run(target);
  pruneBackups(backupDir, day);
  return target;
}

function pruneBackups(backupDir: string, today: string): void {
  const oldest = new Date(`${today}T00:00:00Z`);
  oldest.setUTCDate(oldest.getUTCDate() - (KEEP_DAYS - 1));
  const limit = oldest.toISOString().slice(0, 10);
  for (const name of readdirSync(backupDir)) {
    const day = FILE.exec(name)?.[1];
    if (day && day < limit) rmSync(join(backupDir, name));
  }
}
