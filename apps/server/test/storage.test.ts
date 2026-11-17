import { existsSync, renameSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.ts";
import { openDatabase, transaction } from "../src/storage/db.ts";
import { createStores } from "../src/storage/stores.ts";
import { addDays, isoWeekOf, isoWeekStart, toParisLocal } from "../src/time.ts";
import { session } from "./helpers.ts";

describe("database", () => {
  it("creates the tables in DATA_DIR and reopens without migrating twice", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "annarrive-db-")), "data");
    createStores(openDatabase(dir)).plannedSession.put(session("a", "2026-11-16T18:00"));
    expect(createStores(openDatabase(dir)).plannedSession.get("a")?.start).toBe("2026-11-16T18:00");
  });

  it("keeps the data of a database created under the old name", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "annarrive-db-")), "data");
    const db = openDatabase(dir);
    createStores(db).plannedSession.put(session("a", "2026-11-16T18:00"));
    db.close();
    renameSync(join(dir, "annarrive.db"), join(dir, "talaria.db"));
    expect(createStores(openDatabase(dir)).plannedSession.get("a")?.start).toBe("2026-11-16T18:00");
    expect(existsSync(join(dir, "talaria.db"))).toBe(false);
  });

  it("rolls a failed transaction back", () => {
    const db = openDatabase(":memory:");
    const stores = createStores(db);
    expect(() =>
      transaction(db, () => {
        stores.plannedSession.put(session("a", "2026-11-16T18:00"));
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(stores.plannedSession.get("a")).toBeUndefined();
  });

  it("validates every document written and read", () => {
    const db = openDatabase(":memory:");
    const stores = createStores(db);
    expect(() => stores.plannedSession.put({ id: "a", start: "demain" })).toThrow();
    db.prepare("INSERT INTO planned_session (id, start_at, end_at, data) VALUES ('x', '', '', '{}')").run();
    expect(() => stores.plannedSession.get("x")).toThrow();
  });

  it("keeps a repository for every table of the architecture", () => {
    const stores = createStores(openDatabase(":memory:"));
    stores.activity.put({ id: "g1", start: "2026-11-16T18:00", durMin: 40, distM: 7000 });
    stores.dailySignal.put({ id: "2026-11-16", rhr: 52, sleepMin: 450 });
    stores.fitnessEstimate.put({ id: "f1", date: "2026-11-16", vdot: 41.2, source: "garmin" });
    stores.chatMessage.put({ id: "m1", at: "2026-11-16T07:00:00Z", role: "anna", text: "Salut", widgets: [] });
    stores.health.put({ id: "current", value: { kind: "cold", since: "2026-11-16" } });
    stores.pushSubscription.put({ id: "https://push.example/abc", keys: { p256dh: "k", auth: "a" } });
    expect(stores.activity.overlapping("2026-11-16T00:00", "2026-11-17T00:00")).toHaveLength(1);
    expect(stores.dailySignal.list().map((s) => s.id)).toEqual(["2026-11-16"]);
    expect(stores.fitnessEstimate.get("f1")?.vdot).toBe(41.2);
    expect(stores.chatMessage.list()).toHaveLength(1);
    expect(stores.pushSubscription.list()).toHaveLength(1);
  });
});

describe("time", () => {
  it("converts instants to Paris wall-clock time across DST", () => {
    expect(toParisLocal(new Date("2026-11-16T09:00:00Z"))).toBe("2026-11-16T10:00");
    expect(toParisLocal(new Date("2027-04-06T08:00:00Z"))).toBe("2027-04-06T10:00");
    expect(toParisLocal(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01T00:30");
  });

  it("maps ISO weeks to their Monday and back, across years", () => {
    expect(isoWeekStart("2026-W47")).toBe("2026-11-16");
    expect(isoWeekStart("2027-W01")).toBe("2027-01-04");
    expect(isoWeekOf("2026-11-22")).toBe("2026-W47");
    expect(isoWeekOf("2027-01-01")).toBe("2026-W53");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("config", () => {
  it("requires a long SESSION_SECRET and treats empty variables as unset", () => {
    expect(() => loadConfig({ SESSION_SECRET: "court" })).toThrow(/SESSION_SECRET/);
    const config = loadConfig({ SESSION_SECRET: "x".repeat(32), ICS_URL: "", PORT: "9000" });
    expect(config).toMatchObject({ PORT: 9000, DATA_DIR: "./data" });
    expect(config.ICS_URL).toBeUndefined();
  });
});
