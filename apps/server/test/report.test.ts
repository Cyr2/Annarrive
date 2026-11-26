import { describe, expect, it } from "vitest";
import { defaultProfile } from "../src/services/plan.ts";
import { weekReport } from "../src/services/report.ts";
import { openDatabase } from "../src/storage/db.ts";
import { createStores } from "../src/storage/stores.ts";
import { addDays } from "../src/time.ts";
import { session } from "./helpers.ts";

/** A week with one of each thing the report shows, and one of each thing it must flag. */
function seeded() {
  const stores = createStores(openDatabase(":memory:"));
  stores.profile.put({ id: "current", value: defaultProfile });
  stores.program.put({
    id: "current",
    value: { goal: { distanceM: 21097.5, date: "2027-03-14" }, startedOn: "2026-11-02" },
  });
  // Four weeks of 100 min run before: G2 lets 110 min through.
  for (let w = 1; w <= 4; w++)
    stores.activity.put({ id: `old${w}`, start: `${addDays("2026-11-17", -7 * w)}T18:00`, durMin: 100, distM: 15000 });
  stores.calendarEvent.put({
    id: "anat",
    kind: "class",
    title: "Anatomie",
    start: "2026-11-24T10:15",
    end: "2026-11-24T12:15",
    manual: false,
    cancelled: false,
    recurrence: "weekly",
    exceptions: [],
  });
  const clash = session("clash", "2026-11-24T09:15", { durMin: 45 });
  const mon = session("mon", "2026-11-23T18:00", { status: "done" });
  const wed = session("wed", "2026-11-25T18:00", { type: "I", durMin: 50 });
  const future = session("future", "2026-11-28T09:00", { type: "L", durMin: 90, status: "skipped" });
  for (const s of [clash, mon, wed, future]) stores.plannedSession.put(s);
  stores.watchSync.put({ id: "wed", status: "sent", hash: "x" });
  stores.activity.put({
    id: "run",
    start: "2026-11-23T18:05",
    durMin: 46,
    distM: 7200,
    avgHr: 145,
    feel: "ok",
    sessionId: "mon",
  });
  stores.activity.put({ id: "walk", start: "2026-11-22T10:00", durMin: 60, distM: 4000 });
  stores.changeLog.put({
    id: "c1",
    // 17:00 in Paris: an hour before the session it marks done.
    at: "2026-11-23T16:00:00.000Z",
    summary: "Séance faite",
    mutations: [{ table: "planned_session", id: "mon", before: { ...mon, status: "planned" }, after: mon }],
  });
  stores.changeLog.put({
    id: "c2",
    at: "2026-11-24T07:00:00.000Z",
    summary: "Déplacée",
    mutations: [
      { table: "planned_session", id: "wed", before: { ...wed, start: "2026-11-24T18:00" }, after: wed },
      { table: "profile", id: "current", before: null, after: { id: "current", value: defaultProfile } },
    ],
  });
  stores.fitnessEstimate.put({ id: "f1", date: "2026-11-20", vdot: 41.2, source: "F10" });
  stores.proposal.put({
    id: "p1",
    kind: "vdot",
    from: 41.2,
    to: 42,
    ruleId: "F10",
    evidence: [],
    expiresOn: "2026-11-30",
    status: "pending",
  });
  const said = (at: string, role: "anna" | "reggie", text: string) =>
    stores.chatMessage.put({ id: at, at, role, text, widgets: role === "reggie" ? [{ type: "checking" }] : [] });
  said("2026-11-24T08:00:00.000Z", "anna", "Je suis fatiguée");
  said("2026-11-24T08:00:30.000Z", "anna", "Je suis fatiguée");
  said("2026-11-24T08:01:00.000Z", "reggie", "Repose-toi.");
  said("2026-11-25T08:00:00.000Z", "anna", "Tu es là ?");
  stores.incident.put({
    id: "i1",
    type: "slow",
    message: "GET /api/week 4200 ms",
    at: "2026-11-24T08:02:00.000Z",
    route: "/semaine",
    breadcrumbs: Array.from({ length: 7 }, (_, k) => ({ at: "2026-11-24T08:01:00.000Z", kind: "tap", label: `b${k}` })),
  });
  return stores;
}

describe("weekly report (cli/rapport.ts)", () => {
  const text = weekReport(seeded(), { from: "2026-11-22", to: "2026-11-28", now: "2026-11-26T12:00" });
  const anomalies = text.slice(text.indexOf("== Anomalies =="));

  it("shows the profile, the sessions by week with their watch status, and the runs", () => {
    expect(text).toContain("3 courses/sem, 07:00 à 21:30");
    expect(text).toContain("Objectif 21.0975 km le 2027-03-14");
    expect(text).toMatch(/2026-W48 \(\d+ min/);
    expect(text).toMatch(/mer 25\/11 18:00 {2}I 50 min {2}planned {2}montre sent/);
    expect(text).toContain("séance E lun 23/11 18:00");
    expect(text).toContain("écartée : allure hors bornes");
  });

  it("gives each change its time and only the fields that moved", () => {
    expect(text).toContain("mar 24/11 08:00  Déplacée");
    expect(text).toContain("I mer 25/11 : mar 24/11 18:00 → mer 25/11 18:00 [wed]");
    expect(text).toContain("profile current");
    expect(text).not.toContain('"steps"');
  });

  it("shows the level, the pending proposal, Reggie with widget tags and incidents with 5 gestures", () => {
    expect(text).toContain("VDOT 41.2");
    expect(text).toContain("En attente : vdot 41.2 → 42");
    expect(text).toContain("Reggie  Repose-toi.  [checking]");
    expect(text).toContain("b6");
    expect(text).not.toContain("b1");
  });

  it("flags every anomaly", () => {
    expect(anomalies).toContain("Séance à venir L sam 28/11 09:00 déjà « skipped »");
    expect(anomalies).toContain("touche le cours « Anatomie »");
    // The walk of Sunday counts: she ran that day.
    expect(anomalies).toContain("Courses 3 jours de suite à partir du dim 22/11");
    expect(anomalies).not.toContain("sans réponse mar 24/11");
    expect(anomalies).toContain("Message en double");
    expect(anomalies).toContain("Message d'Anna sans réponse mer 25/11 09:00");
    expect(anomalies).toContain("Lenteur");
    expect(anomalies).toContain("marquée faite dès lun 23/11 17:00");
    expect(anomalies).toContain("Semaine 2026-W48 : 140 min prévues pour 110 au plus");
  });

  it("says when a section is empty", () => {
    const empty = weekReport(createStores(openDatabase(":memory:")), {
      from: "2026-11-22",
      to: "2026-11-28",
      now: "2026-11-26T12:00",
    });
    expect(empty).toContain("Aucun profil");
    expect(empty).toContain("== Anomalies ==\n(rien)");
  });
});
