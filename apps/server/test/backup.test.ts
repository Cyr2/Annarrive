import { existsSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { backupDatabase } from "../src/storage/backup.ts";
import { openDatabase } from "../src/storage/db.ts";

describe("backupDatabase", () => {
  it("writes a readable copy of the live database", () => {
    const dir = mkdtempSync(join(tmpdir(), "talaria-backup-"));
    const db = openDatabase(join(dir, "data"));
    db.prepare("INSERT INTO meta (id, data) VALUES (?, ?)").run("probe", '{"ok":true}');

    const file = backupDatabase(db, join(dir, "backups"), "2026-11-16");

    const copy = new DatabaseSync(file);
    expect(copy.prepare("SELECT data FROM meta WHERE id = ?").get("probe")).toEqual({ data: '{"ok":true}' });
    copy.close();
  });

  it("replaces the copy when it runs twice the same day", () => {
    const dir = mkdtempSync(join(tmpdir(), "talaria-backup-"));
    const db = openDatabase(":memory:");
    backupDatabase(db, dir, "2026-11-16");
    backupDatabase(db, dir, "2026-11-16");
    expect(readdirSync(dir)).toEqual(["talaria-2026-11-16.db"]);
  });

  it("keeps 30 days of copies and leaves other files alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "talaria-backup-"));
    for (const name of ["talaria-2026-10-17.db", "talaria-2026-10-18.db", "notes.txt"]) {
      writeFileSync(join(dir, name), "");
    }

    backupDatabase(openDatabase(":memory:"), dir, "2026-11-16");

    expect(existsSync(join(dir, "talaria-2026-10-17.db"))).toBe(false);
    expect(existsSync(join(dir, "talaria-2026-10-18.db"))).toBe(true);
    expect(existsSync(join(dir, "notes.txt"))).toBe(true);
  });
});
