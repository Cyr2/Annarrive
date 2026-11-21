import { workoutRequestSchema } from "@annarrive/protocol";
import { describe, expect, it, vi } from "vitest";
import { createBridgeClient } from "../src/garmin/bridge-client.ts";
import { buildTestWorkout, runWatchTest, TEST_PREFIX } from "../src/services/watch-test.ts";

const NOW = "2026-11-19T10:00";
const ours = { workoutId: 11, name: `${TEST_PREFIX}Fractionné` };
const coachPlan = { workoutId: 99, name: "Garmin Coach 5K" };

const run = {
  id: 7,
  type: "running",
  startTimeLocal: "2026-11-17 07:30:00",
  startTimeGmt: "2026-11-17 06:30:00",
  durationS: 1500,
  distanceM: 5000,
  avgSpeedMps: 3.33,
  avgPaceSPerKm: 300,
  avgHr: 175,
  maxHr: 185,
  elevationGainM: 0,
  feel: null,
  rpe: null,
};
const lap = { durationS: 300, distanceM: 1000, avgSpeedMps: 3.33, avgHr: 175 };

/** A bridge that answers like the real one and remembers every request. */
function bridge(workouts = [ours, coachPlan]) {
  const calls: string[] = [];
  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    calls.push(`${init?.method ?? "GET"} ${url.pathname}`);
    if (url.pathname === "/workouts" && init?.method === "POST")
      return Response.json({ workoutId: 123 }, { status: 201 });
    if (url.pathname === "/workouts") {
      const prefix = url.searchParams.get("name_prefix") ?? "";
      return Response.json(workouts.filter((w) => w.name.startsWith(prefix)));
    }
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (url.pathname === "/activities") return Response.json([run, { ...run, id: 8, type: "cycling" }]);
    if (url.pathname.endsWith("/laps")) return Response.json(Array.from({ length: 5 }, () => lap));
    return new Response(null, { status: 404 });
  });
  const client = createBridgeClient({ baseUrl: "http://bridge:8000", secret: "s", fetch: fetchMock });
  return { client, calls, fetchMock };
}

describe("watch test tool", () => {
  it.each(["I", "T", "E", "L"] as const)("builds a valid %s session named with the test prefix", (type) => {
    const request = buildTestWorkout(type, 40, "2026-11-25");
    expect(workoutRequestSchema.safeParse(request).success).toBe(true);
    expect(request.name.startsWith(TEST_PREFIX)).toBe(true);
    expect(request.date).toBe("2026-11-25");
  });

  it("gives intervals and easy runs with sprints a warm-up and a repeat group", () => {
    for (const type of ["I", "E"] as const) {
      expect(buildTestWorkout(type, 40, "2026-11-25").steps[0]?.kind).toBe("warmup");
      expect(buildTestWorkout(type, 40, "2026-11-25").steps.some((s) => s.kind === "repeat")).toBe(true);
    }
  });

  it("sends, then prints the id, the repeat group and the pace zones", async () => {
    const { client, calls } = bridge();
    const out = (await runWatchTest(["send", "--date", "2026-11-25", "--type", "I", "--vdot", "45"], client, NOW)).join(
      "\n",
    );
    expect(calls).toEqual(["POST /workouts"]);
    expect(out).toContain("id 123");
    expect(out).toContain("Répéter");
    expect(out).toMatch(/cible \d'\d\d\s\/km, zone \d'\d\d à \d'\d\d\s\/km \(\d\.\d\d à \d\.\d\d m\/s\)/);
    expect(out).toContain("delete 123");
  });

  it("refuses to send without a date or with a wrong option", async () => {
    const { client, calls } = bridge();
    await expect(runWatchTest(["send"], client, NOW)).rejects.toThrow("--date");
    await expect(runWatchTest(["send", "--date", "demain"], client, NOW)).rejects.toThrow();
    await expect(runWatchTest(["send", "--date", "2026-11-25", "--type", "X"], client, NOW)).rejects.toThrow();
    expect(calls).toEqual([]);
  });

  it("lists only workouts with its prefix", async () => {
    expect(await runWatchTest(["list"], bridge().client, NOW)).toEqual(["11  Annarrivé test · Fractionné"]);
    expect(await runWatchTest(["list"], bridge([coachPlan]).client, NOW)).toEqual(["Aucune séance de test."]);
  });

  it("deletes a workout it created", async () => {
    const { client, calls } = bridge();
    expect(await runWatchTest(["delete", "11"], client, NOW)).toEqual([expect.stringContaining("11 supprimée")]);
    expect(calls).toEqual(["GET /workouts", "DELETE /workouts/11"]);
  });

  it("never deletes a workout it did not create", async () => {
    const { client, calls } = bridge();
    await expect(runWatchTest(["delete", "99"], client, NOW)).rejects.toThrow("rien n'est supprimé");
    await expect(runWatchTest(["delete", "abc"], client, NOW)).rejects.toThrow();
    expect(calls.some((c) => c.startsWith("DELETE"))).toBe(false);
  });

  it("reads recent runs with their laps and the F18 reading, and only reads", async () => {
    const { client, calls } = bridge();
    const out = (await runWatchTest(["activities", "--days", "7"], client, NOW)).join("\n");
    expect(out).toContain("2026-11-17 07:30  5.00 km  25:00");
    expect(out).toContain("tour 1  1.00 km  5:00  5'00\u00a0/km  FC 175");
    expect(out).toMatch(/Lecture F18[\s\S]*effort maximal \(race\)[\s\S]*VDOT/);
    expect(calls).toEqual(["GET /activities", "GET /activities/7/laps"]);
  });

  it("says so when there is no run, or no effort to read", async () => {
    const { client } = bridge();
    expect(await runWatchTest(["activities", "--days", "1"], client, "2026-12-30T10:00")).toEqual([
      "Aucune course sur 1 jours.",
    ]);
  });

  it("prints the usage on an unknown command", async () => {
    await expect(runWatchTest(["oups"], bridge().client, NOW)).rejects.toThrow("watch-test.ts send");
  });
});
