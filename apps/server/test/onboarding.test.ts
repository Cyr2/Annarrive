import { describe, expect, it } from "vitest";
import { setup } from "./helpers.ts";

const goal = { distanceM: 10000, date: "2027-04-11" };

describe("onboarding", () => {
  it("is done once a profile is stored", async () => {
    const t = setup();
    await t.login();
    expect(await t.call("GET", "/api/onboarding")).toEqual({ status: 200, json: { done: false } });
    await t.call("PATCH", "/api/profile", { runsPerWeek: 4 });
    expect(await t.call("GET", "/api/onboarding")).toEqual({ status: 200, json: { done: true } });
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
