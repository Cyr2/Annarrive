import type { IncidentInput } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { formatIncident, MAX_INCIDENTS, sinceDate } from "../src/services/incidents.ts";
import { MONDAY_8AM, setup } from "./helpers.ts";

const incident: IncidentInput = {
  type: "api",
  message: "POST /sessions/s1/move : 500",
  at: "2026-11-16T06:59:58.000Z",
  route: "/semaine",
  breadcrumbs: [
    { at: "2026-11-16T06:59:50.000Z", kind: "route", label: "/semaine" },
    { at: "2026-11-16T06:59:55.000Z", kind: "tap", label: "Déplacer" },
    { at: "2026-11-16T06:59:57.000Z", kind: "api", label: "GET /login?token=abc 200 · 80 ms" },
  ],
  device: {
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X)",
    viewport: "390x844",
    standalone: true,
    os: "ios",
    version: "app-B3x9.js",
    timezone: "Europe/Paris",
    online: true,
  },
};
const DAY = 86_400_000;

describe("incident journal", () => {
  it("stores what the phone sends, tied to the session's account and redacted again", async () => {
    const t = setup();
    await t.login();
    expect((await t.call("POST", "/api/incidents", { incidents: [incident] })).status).toBe(204);
    const [kept] = t.services.incidents.list(new Date(0));
    expect(kept).toMatchObject({ type: "api", clientAt: incident.at, at: MONDAY_8AM.toISOString(), route: "/semaine" });
    expect(kept?.breadcrumbs[2]?.label).toBe("GET /login?… 200 · 80 ms");
  });

  it("refuses a request without a session, from another site, or too big", async () => {
    const t = setup();
    const batch = { incidents: [incident] };
    expect((await t.call("POST", "/api/incidents", batch)).status).toBe(401);
    await t.login();
    expect(
      (await t.call("POST", "/api/incidents", { incidents: [{ ...incident, stack: "x".repeat(8001) }] })).status,
    ).toBe(400);
    expect((await t.call("POST", "/api/incidents", { incidents: [] })).status).toBe(400);
    const cookie = (await t.login()).headers.get("set-cookie")?.split(";")[0] ?? "";
    const foreign = await t.app.request("/api/incidents", {
      method: "POST",
      headers: { cookie, "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify(batch),
    });
    expect(foreign.status).toBe(403);
    expect(t.services.incidents.list(new Date(0))).toEqual([]);
  });

  it("stops a session that sends too much", async () => {
    const t = setup();
    await t.login();
    const statuses = [];
    for (let i = 0; i < 31; i++)
      statuses.push((await t.call("POST", "/api/incidents", { incidents: [incident] })).status);
    expect(statuses.at(29)).toBe(204);
    expect(statuses.at(30)).toBe(429);
  });

  it("records an unexpected server error with its route, never the request body", async () => {
    const t = setup({ ics: async () => Promise.reject(new TypeError("https://edt.test/x.ics?key=secret refused")) });
    await t.login();
    expect((await t.call("POST", "/api/timetable/refresh", { note: "privé" })).status).toBe(500);
    const [kept] = t.services.incidents.list(new Date(0));
    expect(kept).toMatchObject({ type: "server", route: "POST /api/timetable/refresh" });
    expect(kept?.message).toBe("TypeError: https://edt.test/x.ics?… refused");
    expect(JSON.stringify(kept)).not.toContain("privé");
  });

  it("keeps 30 days, newest first, and lists from a given time", () => {
    const t = setup();
    t.services.incidents.record([{ ...incident, message: "old" }], "anna");
    t.setNow(new Date(MONDAY_8AM.getTime() + 20 * DAY));
    t.services.incidents.record([{ ...incident, message: "new" }], "anna");
    expect(t.services.incidents.list(new Date(0)).map((i) => i.message)).toEqual(["new", "old"]);
    expect(t.services.incidents.list(new Date(MONDAY_8AM.getTime() + DAY)).map((i) => i.message)).toEqual(["new"]);
    t.setNow(new Date(MONDAY_8AM.getTime() + 31 * DAY));
    t.services.incidents.purge();
    expect(t.services.incidents.list(new Date(0)).map((i) => i.message)).toEqual(["new"]);
  });
});

describe("incident cap", () => {
  it("keeps only the latest 500 rows", () => {
    const t = setup();
    for (let i = 0; i < MAX_INCIDENTS + 5; i++) {
      t.setNow(new Date(MONDAY_8AM.getTime() + i * 1000));
      t.services.incidents.record([{ ...incident, message: `m${i}` }], "anna");
    }
    const kept = t.services.incidents.list(new Date(0));
    expect(kept).toHaveLength(MAX_INCIDENTS);
    expect(kept[0]?.message).toBe(`m${MAX_INCIDENTS + 4}`);
  });
});

describe("incidents CLI", () => {
  it("reads a duration back from now", () => {
    expect(sinceDate("2d", MONDAY_8AM).getTime()).toBe(MONDAY_8AM.getTime() - 2 * DAY);
    expect(sinceDate("12h", MONDAY_8AM).getTime()).toBe(MONDAY_8AM.getTime() - 12 * 3_600_000);
    expect(sinceDate("30m", MONDAY_8AM).getTime()).toBe(MONDAY_8AM.getTime() - 30 * 60_000);
    expect(() => sinceDate("2 jours", MONDAY_8AM)).toThrow("Durée illisible");
  });

  it("prints an incident as a readable timeline in Paris time", () => {
    const t = setup();
    t.services.incidents.record([{ ...incident, stack: "Error: boom\n  at move (app-B3x9.js:1:200)" }], "anna");
    const [kept] = t.services.incidents.list(new Date(0));
    if (!kept) throw new Error("no incident");
    expect(formatIncident(kept)).toBe(
      [
        `#${kept.id}  2026-11-16 08:00:00  api  POST /sessions/s1/move : 500`,
        "  anna · /semaine · ios PWA · app-B3x9.js · Europe/Paris · 390x844 · en ligne",
        "  Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X)",
        "  Pile :",
        "    Error: boom",
        "    at move (app-B3x9.js:1:200)",
        "  Derniers gestes :",
        "    07:59:50  route  /semaine",
        "    07:59:55  tap    Déplacer",
        "    07:59:57  api    GET /login?… 200 · 80 ms",
      ].join("\n"),
    );
    t.services.incidents.recordServerError("GET /api/x", new Error("boom"));
    const server = t.services.incidents.list(new Date(0)).find((i) => i.type === "server");
    expect(server && formatIncident(server).split("\n")[1]).toBe("  sans compte · GET /api/x");
  });
});
