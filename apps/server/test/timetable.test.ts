import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { timetableRefreshSchema, timetableStatusSchema } from "@talaria/protocol";
import { afterEach, describe, expect, it } from "vitest";
import { TimetableError } from "../src/errors.ts";
import { diffSummary, icsFetcher, parseTimetable } from "../src/services/timetable.ts";
import { session, setup } from "./helpers.ts";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const v1 = fixture("timetable-v1.ics");
const v2 = fixture("timetable-v2.ics");

function switchableFeed() {
  let current = v1;
  return { fetch: async () => current, set: (ics: string) => (current = ics) };
}

describe("parseTimetable", () => {
  it("keeps only VEVENTs and converts UTC to Paris time, winter and summer", () => {
    const events = parseTimetable(v1);
    expect(events.map((e) => e.id)).toEqual([
      "ics:ADE-past",
      "ics:ADE-mon",
      "ics:ADE-tue",
      "ics:ADE-thu",
      "ics:ADE-spring",
    ]);
    expect(events[1]).toMatchObject({
      kind: "class",
      title: "(M1M2E PE NL) UE2 PHYS",
      location: "Amphi A",
      start: "2026-11-16T10:00",
      end: "2026-11-16T12:00",
      cancelled: false,
      manual: false,
    });
    expect(events[4]).toMatchObject({ start: "2027-04-06T10:00", end: "2027-04-06T12:00" });
  });

  it("refuses a VEVENT it cannot read instead of dropping a class", () => {
    const broken = "BEGIN:VCALENDAR\nBEGIN:VEVENT\nUID:x\nSUMMARY:Sans date\nEND:VEVENT\nEND:VCALENDAR\n";
    expect(() => parseTimetable(broken)).toThrow(/illisible/);
  });
});

describe("diffSummary", () => {
  it("groups classes by change and weekday, plural included", () => {
    expect(
      diffSummary([
        { verb: "ajouté", date: "2026-11-16" },
        { verb: "annulé", date: "2026-11-19" },
        { verb: "annulé", date: "2026-11-19" },
      ]),
    ).toBe("2 cours annulés jeudi · 1 cours ajouté lundi");
  });
});

describe("timetable sync", () => {
  it("imports every class on the first sync and records the sync time", async () => {
    const t = setup({ ics: v1 });
    await t.login();
    const refresh = timetableRefreshSchema.parse((await t.call("POST", "/api/timetable/refresh")).json);
    expect(refresh).toMatchObject({ added: 4, changed: 0, removed: 0, change: null });
    expect(t.stores.calendarEvent.get("ics:ADE-past")).toBeDefined();
    const status = timetableStatusSchema.parse((await t.call("GET", "/api/timetable")).json);
    expect(status.lastSyncAt).toBe("2026-11-16T07:00:00.000Z");
  });

  it("reports added, changed and removed classes and moves the run a new class lands on", async () => {
    const feed = switchableFeed();
    const t = setup({ ics: feed.fetch });
    await t.services.timetable.refresh();
    t.stores.plannedSession.put(session("fri", "2026-11-20T08:30"));
    feed.set(v2);

    const refresh = await t.services.timetable.refresh();

    expect(refresh).toMatchObject({ added: 1, changed: 1, removed: 1 });
    expect(refresh.summary).toBe(
      "1 cours annulé jeudi · 1 cours ajouté vendredi · 1 cours modifié mardi · 1 course déplacée",
    );
    expect(t.stores.calendarEvent.get("ics:ADE-thu")).toBeUndefined();
    expect(t.stores.calendarEvent.get("ics:ADE-tue")?.start).toBe("2026-11-17T16:00");
    expect(t.stores.plannedSession.get("fri")?.start).toBe("2026-11-20T10:30");

    // The run move goes through the change log, so Annuler puts it back.
    t.services.changes.undo(refresh.change?.id ?? "");
    expect(t.stores.plannedSession.get("fri")?.start).toBe("2026-11-20T08:30");
  });

  it("changes nothing when the feed did not change", async () => {
    const t = setup({ ics: v1 });
    await t.services.timetable.refresh();
    expect(await t.services.timetable.refresh()).toMatchObject({ added: 0, changed: 0, removed: 0, summary: "" });
  });

  it("keeps a class marked cancelled by Anna across the next syncs", async () => {
    const feed = switchableFeed();
    const t = setup({ ics: feed.fetch });
    await t.services.timetable.refresh();
    t.services.plan.cancelClass("ics:ADE-tue");
    feed.set(v2);
    await t.services.timetable.refresh();
    expect(t.stores.calendarEvent.get("ics:ADE-tue")).toMatchObject({ cancelled: true, start: "2026-11-17T16:00" });
  });

  it("leaves the stored timetable alone when the feed comes back empty", async () => {
    const feed = switchableFeed();
    const t = setup({ ics: feed.fetch });
    await t.services.timetable.refresh();
    feed.set("BEGIN:VCALENDAR\nEND:VCALENDAR\n");
    await expect(t.services.timetable.refresh()).rejects.toThrow(/vide/);
    expect(t.stores.calendarEvent.get("ics:ADE-thu")).toBeDefined();
  });

  it("reports an unreachable feed in French with a 502", async () => {
    const t = setup({
      ics: async () => {
        throw new TimetableError("L'emploi du temps ne répond pas");
      },
    });
    await t.login();
    expect(await t.call("POST", "/api/timetable/refresh")).toEqual({
      status: 502,
      json: { error: "L'emploi du temps ne répond pas" },
    });
  });
});

describe("timetable link set by Anna", () => {
  it("reads the env link until Anna pastes hers, then hers first", async () => {
    const read: string[] = [];
    const t = setup({
      ics: async (url) => {
        read.push(url);
        return v1;
      },
    });
    await t.login();
    await t.services.timetable.refresh();

    const saved = await t.call("PUT", "/api/timetable/url", { url: "https://edt.univ.fr/anna.ics" });

    expect(saved.status).toBe(200);
    expect(timetableRefreshSchema.parse(saved.json).lastSyncAt).toBe("2026-11-16T07:00:00.000Z");
    expect(read).toEqual(["https://edt.test/env.ics", "https://edt.univ.fr/anna.ics"]);
    expect((await t.call("GET", "/api/profile")).json).toMatchObject({ icsUrl: "https://edt.univ.fr/anna.ics" });
    await t.services.timetable.refresh();
    expect(read.at(-1)).toBe("https://edt.univ.fr/anna.ics");
  });

  it("refuses a link that is not https, in French, and keeps the old one", async () => {
    const t = setup({ ics: v1 });
    await t.login();
    const refused = await t.call("PUT", "/api/timetable/url", { url: "http://edt.univ.fr/anna.ics" });
    expect(refused.status).toBe(400);
    expect(JSON.stringify(refused.json)).toContain("https://");
    expect(t.services.timetable.url()).toBe("https://edt.test/env.ics");
  });

  it("asks for a link when neither Anna nor the server has one", async () => {
    const t = setup({ ics: v1, icsUrl: null });
    await t.login();
    expect(t.services.timetable.url()).toBeUndefined();
    const missing = await t.call("POST", "/api/timetable/refresh");
    expect(missing.status).toBe(503);
    expect(JSON.stringify(missing.json)).toContain("Programme");
  });

  it("keeps the link out of the settings patch and lets Annuler restore the previous one", async () => {
    const t = setup({ ics: v1, icsUrl: null });
    await t.login();
    await t.call("PATCH", "/api/profile", { icsUrl: "https://ailleurs.fr/x.ics", runsPerWeek: 4 });
    expect(t.services.timetable.url()).toBeUndefined();
    await t.services.timetable.setUrl("https://edt.univ.fr/anna.ics");
    const [entry] = t.stores.changeLog.list().filter((c) => c.summary.startsWith("Lien"));
    t.services.changes.undo(entry?.id ?? "");
    expect(t.services.timetable.url()).toBeUndefined();
  });
});

describe("icsFetcher", () => {
  const servers: ReturnType<typeof createServer>[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) server.close();
  });

  async function serve(handler: Parameters<typeof createServer>[1]): Promise<string> {
    const server = createServer(handler);
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/edt.ics`;
  }

  it("downloads the feed", async () => {
    const url = await serve((_req, res) => res.end(v1));
    expect(await icsFetcher()(url)).toBe(v1);
  });

  it("gives up after the timeout without revealing the URL", async () => {
    const url = await serve(() => undefined);
    const error = await icsFetcher(50)(url).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toMatch(/ne répond pas/);
    expect(String(error)).not.toContain("127.0.0.1");
  });

  it("reports an HTTP error status", async () => {
    const url = await serve((_req, res) => {
      res.statusCode = 404;
      res.end();
    });
    await expect(icsFetcher()(url)).rejects.toThrow(/404/);
  });
});
