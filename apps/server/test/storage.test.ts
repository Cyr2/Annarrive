import { existsSync, renameSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CalendarEvent } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { z } from "zod";
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

  it("turns stored hill sessions into flat ones, in the plan and in the change log (P12)", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "annarrive-db-")), "data");
    const old = openDatabase(dir);
    const version = z.object({ user_version: z.number() }).parse(old.prepare("PRAGMA user_version").get()).user_version;
    old.exec(`PRAGMA user_version = ${version - 1}`);
    const hills = JSON.stringify({
      ...session("h", "2026-11-20T18:00"),
      type: "COTES_C",
      steps: [{ kind: "hills", durMin: 1 / 6, reps: 6, zone: "R", target: { rpe: 8 } }],
    });
    old.prepare("INSERT INTO planned_session (id, start_at, end_at, data) VALUES ('h', '', '', ?)").run(hills);
    const log = JSON.stringify({
      id: "x",
      at: "2026-11-16T07:00:00Z",
      summary: "Séance déplacée",
      mutations: [{ table: "planned_session", id: "h", before: JSON.parse(hills), after: null }],
    });
    old.prepare("INSERT INTO change_log (id, start_at, end_at, data) VALUES ('x', '', '', ?)").run(log);
    old.close();

    const stores = createStores(openDatabase(dir));

    expect(stores.plannedSession.get("h")).toMatchObject({ type: "E", steps: [{ kind: "strides", zone: "R" }] });
    expect(JSON.stringify(stores.changeLog.get("x"))).not.toMatch(/COTES|hills/);
  });

  it("removes the duplicated classes of past reads, keeping her « n'a pas lieu » and what Annuler points to", async () => {
    const dir = join(await mkdtemp(join(tmpdir(), "annarrive-db-")), "data");
    const old = openDatabase(dir);
    const version = z.object({ user_version: z.number() }).parse(old.prepare("PRAGMA user_version").get()).user_version;
    // Back to the database as it was before the fix, duplicates allowed (the hills migration came after it).
    old.exec(`DROP INDEX calendar_event_class; PRAGMA user_version = ${version - 2}`);
    const stores = createStores(old);
    const at = (title: string, start: string, end: string, id: string, over: Partial<CalendarEvent> = {}) =>
      stores.calendarEvent.put({ ...classEvent(title, start, end), id, ...over });
    for (const id of ["a1", "a2", "a3"])
      at("Maths", "2026-11-09T10:00", "2026-11-09T12:00", id, { cancelled: id === "a2" });
    for (const id of ["b1", "b2"]) at("Physique", "2026-11-17T10:00", "2026-11-17T12:00", id);
    for (const id of ["c1", "c2", "c3"]) at("Chimie", "2026-11-18T10:00", "2026-11-18T12:00", id);
    at("Physique", "2026-11-17T14:00", "2026-11-17T16:00", "d1");
    for (const id of ["m1", "m2"])
      at("Muscu", "2026-11-18T10:00", "2026-11-18T12:00", id, { kind: "strength", manual: true });
    stores.changeLog.put({
      id: "x",
      at: "2026-11-16T07:00:00Z",
      summary: "Cours modifié",
      mutations: [{ table: "calendar_event", id: "b2", before: null, after: null }],
    });
    old.close();

    const repaired = createStores(openDatabase(dir));

    expect(repaired.calendarEvent.list().map((e) => `${e.id}${e.cancelled ? " annulé" : ""}`)).toEqual([
      "a2 annulé",
      "b2",
      "d1",
      "c1",
      "m1",
      "m2",
    ]);
    // A class written twice under two ids keeps one row.
    repaired.calendarEvent.put({ ...classEvent("Physique", "2026-11-17T14:00", "2026-11-17T16:00"), id: "d2" });
    expect(
      repaired.calendarEvent
        .list()
        .filter((e) => e.title === "Physique")
        .map((e) => e.id),
    ).toEqual(["b2", "d2"]);
  });
});

function classEvent(title: string, start: string, end: string): CalendarEvent {
  return {
    id: "",
    kind: "class",
    title,
    start,
    end,
    manual: false,
    cancelled: false,
    recurrence: "none",
    exceptions: [],
  };
}

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

  it("requires a long BRIDGE_SECRET when set", () => {
    const base = { SESSION_SECRET: "x".repeat(32) };
    expect(() => loadConfig({ ...base, BRIDGE_SECRET: "court" })).toThrow(/BRIDGE_SECRET/);
    expect(loadConfig({ ...base, BRIDGE_SECRET: "y".repeat(32) }).BRIDGE_SECRET).toHaveLength(32);
  });

  it("sends to Garmin unless GARMIN_WRITE is off", () => {
    const secret = { SESSION_SECRET: "x".repeat(32) };
    expect(loadConfig(secret).GARMIN_WRITE).toBe(true);
    expect(loadConfig({ ...secret, GARMIN_WRITE: "" }).GARMIN_WRITE).toBe(true);
    expect(loadConfig({ ...secret, GARMIN_WRITE: "on" }).GARMIN_WRITE).toBe(true);
    expect(loadConfig({ ...secret, GARMIN_WRITE: "off" }).GARMIN_WRITE).toBe(false);
    expect(() => loadConfig({ ...secret, GARMIN_WRITE: "non" })).toThrow(/GARMIN_WRITE/);
  });
});
