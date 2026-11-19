import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { checkBackup, restoreReport } from "../src/services/restore-check.ts";
import { backupDatabase } from "../src/storage/backup.ts";
import { openDatabase, schemaVersion } from "../src/storage/db.ts";

const dir = () => mkdtempSync(join(tmpdir(), "annarrive-restore-"));

describe("checkBackup", () => {
  it("reads a real nightly backup: integrity, version, counts, last change", () => {
    const root = dir();
    const db = openDatabase(join(root, "data"));
    db.prepare("INSERT INTO change_log (id, start_at, data) VALUES (?, ?, ?)").run("c1", "2026-11-18T09:00", "{}");
    db.prepare("INSERT INTO change_log (id, start_at, data) VALUES (?, ?, ?)").run("c2", "2026-11-19T07:30", "{}");
    const file = backupDatabase(db, join(root, "backups"), "2026-11-19");

    const report = checkBackup(file);

    expect(report).toMatchObject({ ok: true, integrity: "ok", version: schemaVersion, lastChange: "2026-11-19T07:30" });
    expect(report.counts.change_log).toBe(2);
    expect(report.counts.planned_session).toBe(0);
    const text = restoreReport(file, report);
    expect(text).toContain("Intégrité : ok");
    expect(text).toContain("change_log");
    expect(text).toContain("Cette sauvegarde est utilisable.");
  });

  it("never writes to the copy it checks", () => {
    const root = dir();
    const file = backupDatabase(openDatabase(":memory:"), root, "2026-11-19");
    checkBackup(file);
    const db = new DatabaseSync(file, { readOnly: true });
    expect(() => db.exec("INSERT INTO meta (id, data) VALUES ('x', '{}')")).toThrow();
  });

  it("reports an older schema as usable and a newer one as not", () => {
    const root = dir();
    const file = backupDatabase(openDatabase(":memory:"), root, "2026-11-19");
    const copy = new DatabaseSync(file);
    copy.exec(`PRAGMA user_version = ${schemaVersion - 1}`);
    copy.close();
    const older = checkBackup(file);
    expect(older.ok).toBe(true);
    expect(restoreReport(file, older)).toContain("sera mise à jour au démarrage");

    const newer = new DatabaseSync(file);
    newer.exec(`PRAGMA user_version = ${schemaVersion + 1}`);
    newer.close();
    const report = checkBackup(file);
    expect(report.ok).toBe(false);
    expect(restoreReport(file, report)).toMatch(/plus récente[\s\S]*PAS utilisable/);
  });

  it("reports a missing change log as none", () => {
    const file = join(dir(), "empty.db");
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE meta (id TEXT)");
    db.close();
    const report = checkBackup(file);
    expect(report.lastChange).toBeNull();
    expect(restoreReport(file, report)).toContain("Dernière modification du plan : aucune");
  });

  it("refuses a missing or corrupt file", () => {
    expect(() => checkBackup(join(dir(), "absent.db"))).toThrow("introuvable");
    const bad = join(dir(), "bad.db");
    writeFileSync(bad, "ceci n'est pas une base SQLite, loin de là. ".repeat(50));
    expect(() => checkBackup(bad)).toThrow();
  });

  it("reports the current schema version as the app's own", () => {
    const file = backupDatabase(openDatabase(":memory:"), dir(), "2026-11-19");
    expect(restoreReport(file, checkBackup(file))).toContain("la version de cette application");
  });
});
