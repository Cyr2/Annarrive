import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { schemaVersion } from "../storage/db.ts";

export type RestoreReport = {
  /** Integrity "ok" and a schema this build can open (not newer than it). */
  ok: boolean;
  integrity: string;
  version: number;
  counts: Record<string, number>;
  lastChange: string | null;
};

const row = <T extends z.ZodType>(schema: T, value: unknown): z.infer<T> => schema.parse(value);

/**
 * Opens a backup read-only (nothing is migrated, nothing written, the live database is never named) and reports
 * what a restore would bring back. `ok` is false unless SQLite's own integrity check says "ok".
 */
export function checkBackup(file: string): RestoreReport {
  if (!existsSync(file)) throw new Error(`Fichier introuvable : ${file}`);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = row(
      z.object({ integrity_check: z.string() }),
      db.prepare("PRAGMA integrity_check").get(),
    ).integrity_check;
    const { user_version: version } = row(
      z.object({ user_version: z.number() }),
      db.prepare("PRAGMA user_version").get(),
    );
    const tables = z
      .array(z.object({ name: z.string() }))
      .parse(
        db
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
          .all(),
      );
    const counts: Record<string, number> = {};
    for (const { name } of tables)
      counts[name] = row(z.object({ n: z.number() }), db.prepare(`SELECT count(*) AS n FROM "${name}"`).get()).n;
    const lastChange = counts.change_log
      ? row(z.object({ at: z.string().nullable() }), db.prepare("SELECT max(start_at) AS at FROM change_log").get()).at
      : null;
    return { ok: integrity === "ok" && version <= schemaVersion, integrity, version, counts, lastChange };
  } finally {
    db.close();
  }
}

export function restoreReport(file: string, report: RestoreReport): string {
  const versionNote =
    report.version === schemaVersion
      ? "la version de cette application"
      : report.version < schemaVersion
        ? `plus ancienne que l'application (${schemaVersion}) : elle sera mise à jour au démarrage`
        : `plus récente que l'application (${schemaVersion}) : ne pas restaurer avec cette version`;
  return [
    `Sauvegarde : ${file}`,
    `Intégrité : ${report.integrity}`,
    `Version du schéma : ${report.version} (${versionNote})`,
    `Dernière modification du plan : ${report.lastChange ?? "aucune"}`,
    "Lignes par table :",
    ...Object.entries(report.counts).map(([name, n]) => `  ${name.padEnd(18)} ${n}`),
    "",
    report.ok ? "Cette sauvegarde est utilisable." : "Cette sauvegarde n'est PAS utilisable telle quelle.",
  ].join("\n");
}
