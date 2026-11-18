import { incidentBatchSchema } from "@annarrive/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiCall, breadcrumbs, crumb, flush, incident, installJournal, renderError, resetJournal } from "./journal.ts";

const online = (value: boolean) => vi.spyOn(navigator, "onLine", "get").mockReturnValue(value);
const sentBodies = (fetcher: ReturnType<typeof ok>) =>
  fetcher.mock.calls.flatMap(([, init]) => incidentBatchSchema.parse(JSON.parse(String(init?.body))).incidents);
const ok = () => vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));

beforeEach(() => {
  resetJournal();
  localStorage.clear();
  online(true);
});
afterEach(() => vi.restoreAllMocks());

describe("breadcrumbs", () => {
  it("keeps the last 50", () => {
    for (let i = 0; i < 60; i++) crumb("route", `/r${i}`);
    expect(breadcrumbs()).toHaveLength(50);
    expect(breadcrumbs()[0]?.label).toBe("/r10");
  });

  it("names a tap by its label, never by what was typed, and strips secrets from API paths", () => {
    installJournal();
    document.body.innerHTML = `
      <button aria-label="Envoyer à Reggie"><svg></svg></button>
      <div data-crumb="Carte séance"><span>Footing</span></div>
      <input id="field" value="je cours avec Léa">`;
    document.querySelector("button")?.click();
    document.querySelector("span")?.click();
    document.querySelector("input")?.click();
    apiCall("GET", "/auth/login?token=abcdef", 200, 80);
    const labels = breadcrumbs().map((b) => `${b.kind} ${b.label}`);
    expect(labels).toEqual(["tap Envoyer à Reggie", "tap Carte séance", "api GET /auth/login 200 · 80 ms"]);
    expect(JSON.stringify(breadcrumbs())).not.toContain("Léa");
  });
});

describe("incidents", () => {
  it("records a failed or slow call with the gestures before it, once per message", async () => {
    crumb("tap", "Déplacer");
    apiCall("POST", "/sessions/s1/move", 500, 120);
    apiCall("POST", "/sessions/s1/move", 500, 120);
    apiCall("GET", "/today", 200, 4200);
    const fetcher = ok();
    await flush(fetcher);
    const sent = sentBodies(fetcher);
    expect(sent.map((i) => `${i.type} ${i.message}`)).toEqual([
      "api POST /sessions/s1/move : 500",
      "slow GET /today a mis plus de 3 s",
    ]);
    expect(sent[0]?.breadcrumbs.map((b) => b.label)).toEqual(["Déplacer", "POST /sessions/s1/move 500 · 120 ms"]);
    expect(sent[0]?.device).toMatchObject({ os: "other", online: true, standalone: false });
    expect(JSON.stringify(fetcher.mock.calls)).not.toMatch(/cookie/i);
  });

  it("tells a screen file that did not load from a crash, and redacts tokens", async () => {
    renderError(new TypeError("Failed to fetch dynamically imported module: /assets/Week.js"), "at WeekScreen");
    renderError(new Error(`token ${"x".repeat(43)} broke`));
    const fetcher = ok();
    await flush(fetcher);
    const [chunk, render] = sentBodies(fetcher);
    expect(chunk).toMatchObject({ type: "chunk" });
    expect(chunk?.stack).toContain("at WeekScreen");
    expect(render).toMatchObject({ type: "render", message: "token [secret] broke" });
  });

  it("waits offline in storage, then leaves once back online", async () => {
    online(false);
    incident("report", "La semaine est vide");
    const fetcher = ok();
    await flush(fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(localStorage.getItem("annarrive-incidents")).toContain("La semaine est vide");

    resetJournal(); // the app was closed and opened again
    online(true);
    await flush(fetcher);
    expect(sentBodies(fetcher).map((i) => i.message)).toEqual(["La semaine est vide"]);
    expect(localStorage.getItem("annarrive-incidents")).toBeNull();
  });

  it("keeps the queue when the server is down or she is signed out, drops what it refuses", async () => {
    incident("report", "un");
    await flush(vi.fn(async () => new Response(null, { status: 503 })));
    await flush(vi.fn(async () => new Response(null, { status: 401 })));
    await flush(vi.fn(async () => Promise.reject(new TypeError("offline"))));
    expect(localStorage.getItem("annarrive-incidents")).toContain("un");
    await flush(vi.fn(async () => new Response(null, { status: 400 })));
    expect(localStorage.getItem("annarrive-incidents")).toBeNull();
  });

  it("records at most 20 per page load, keeps the newest 20, sends them in batches of 3", async () => {
    for (let i = 0; i < 30; i++) incident("error", `e${i}`);
    incident("report", "souci");
    const fetcher = ok();
    await flush(fetcher);
    const sent = sentBodies(fetcher);
    expect(sent.map((i) => i.message)).toEqual([...Array.from({ length: 19 }, (_, i) => `e${i + 1}`), "souci"]);
    expect(fetcher).toHaveBeenCalledTimes(7);
  });
});
