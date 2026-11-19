import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { setup } from "./helpers.ts";

const v1 = readFileSync(new URL("./fixtures/timetable-v1.ics", import.meta.url), "utf8");

const goal = { distanceM: 10000, date: "2027-04-11" };

describe("onboarding", () => {
  it("is done once a profile is stored", async () => {
    const t = setup();
    await t.login();
    expect(await t.call("GET", "/api/onboarding")).toEqual({ status: 200, json: { done: false } });
    await t.call("PATCH", "/api/profile", { runsPerWeek: 4 });
    expect(await t.call("GET", "/api/onboarding")).toEqual({ status: 200, json: { done: true } });
  });

  // The link pasted at onboarding was dropped by the profile patch (audit onboarding 1).
  it("reads the timetable link pasted at onboarding before the first plan, and keeps it in the profile", async () => {
    const t = setup({ ics: v1, icsUrl: null });
    await t.login();
    await t.call("PUT", "/api/program", { goal });
    expect((await t.call("PUT", "/api/timetable/url", { url: "https://edt.univ.fr/anna.ics" })).status).toBe(200);
    // Not done yet: the profile still has to come.
    expect(await t.call("GET", "/api/onboarding")).toEqual({ status: 200, json: { done: false } });
    expect(t.stores.calendarEvent.list().some((e) => e.kind === "class")).toBe(true);
    await t.call("PATCH", "/api/profile", { runsPerWeek: 4 });
    expect(await t.call("GET", "/api/onboarding")).toEqual({ status: 200, json: { done: true } });
    expect(t.services.plan.profile()).toMatchObject({ runsPerWeek: 4, icsUrl: "https://edt.univ.fr/anna.ics" });
  });
});

describe("feasibility", () => {
  it("gives no verdict while her form is unknown", async () => {
    const t = setup();
    await t.login();
    expect(await t.call("POST", "/api/feasibility", { ...goal, targetMin: 55 })).toEqual({
      status: 200,
      json: { verdict: null },
    });
  });

  it("only says atteignable or ambitieux, from the Garmin VO2max", async () => {
    const t = setup();
    await t.login();
    t.stores.dailySignal.put({ id: "2026-11-10", vo2max: 45 });
    const verdict = async (targetMin: number) =>
      (await t.call("POST", "/api/feasibility", { ...goal, targetMin })).json;
    expect(await verdict(70)).toEqual({ verdict: "atteignable" });
    expect(await verdict(38)).toEqual({ verdict: "ambitieux" });
  });

  it("needs the target time", async () => {
    const t = setup();
    await t.login();
    expect((await t.call("POST", "/api/feasibility", goal)).status).toBe(400);
  });
});
