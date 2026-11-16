import type { WorkoutRequest } from "@talaria/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BridgeError,
  BridgeInvalidResponseError,
  BridgeUnreachableError,
  createBridgeClient,
  GarminAuthError,
  GarminRateLimitError,
} from "../src/garmin/bridge-client.ts";

const activity = {
  id: 42,
  type: "running",
  startTimeLocal: "2026-11-15 07:30:00",
  startTimeGmt: "2026-11-15 06:30:00",
  durationS: 1800,
  distanceM: 5000,
  avgSpeedMps: 2.5,
  avgPaceSPerKm: 400,
  avgHr: 150,
  maxHr: 172,
  elevationGainM: null,
  feel: null,
  rpe: null,
};

const workout: WorkoutRequest = {
  name: "Fractionné 6 x 800 m",
  date: "2026-11-18",
  steps: [
    { kind: "warmup", durationS: 900 },
    { kind: "repeat", iterations: 6, steps: [{ kind: "interval", distanceM: 800 }] },
  ],
};

function clientAnswering(response: Response | Error) {
  const fetchMock = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const client = createBridgeClient({ baseUrl: "http://bridge:8000", secret: "s3cret", fetch: fetchMock });
  return { client, fetchMock };
}

const json = (body: unknown, init?: ResponseInit) => Response.json(body, init);

describe("bridge client", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("reads its configuration from the environment and refuses to start without it", () => {
    vi.stubEnv("BRIDGE_URL", "");
    vi.stubEnv("BRIDGE_SECRET", "");
    expect(() => createBridgeClient()).toThrow(BridgeError);
    vi.stubEnv("BRIDGE_URL", "http://bridge:8000");
    vi.stubEnv("BRIDGE_SECRET", "s3cret");
    expect(createBridgeClient()).toBeDefined();
  });

  it("sends the shared secret and validates the activities", async () => {
    const { client, fetchMock } = clientAnswering(json([activity]));
    expect(await client.recentActivities(5)).toEqual([activity]);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://bridge:8000/activities?limit=5");
    expect(init?.headers).toMatchObject({ "x-bridge-secret": "s3cret" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("reads laps and daily signals", async () => {
    const lap = { durationS: 200, distanceM: 800, avgSpeedMps: 4, avgHr: 170 };
    expect(await clientAnswering(json([lap])).client.activityLaps(42)).toEqual([lap]);
    const daily = {
      date: "2026-11-16",
      sleepS: null,
      sleepScore: null,
      restingHr: 52,
      stressAvg: null,
      bodyBatteryAtWake: null,
      bodyBatteryHighest: null,
      vo2Max: 44.6,
    };
    const { client, fetchMock } = clientAnswering(json(daily));
    expect(await client.dailySignals("2026-11-16")).toEqual(daily);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://bridge:8000/daily/2026-11-16");
  });

  it("posts a validated workout and returns its Garmin id", async () => {
    const { client, fetchMock } = clientAnswering(json({ workoutId: 987 }, { status: 201 }));
    expect(await client.createWorkout(workout)).toEqual({ workoutId: 987 });
    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual(workout);
  });

  it("refuses to send an invalid workout", async () => {
    const { client, fetchMock } = clientAnswering(json({ workoutId: 1 }));
    await expect(client.createWorkout({ ...workout, steps: [] })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("deletes a workout", async () => {
    const { client, fetchMock } = clientAnswering(new Response(null, { status: 204 }));
    await client.deleteWorkout(987);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("http://bridge:8000/workouts/987");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("DELETE");
  });

  it("maps a 401 to GarminAuthError", async () => {
    const { client } = clientAnswering(json({ code: "garmin_auth" }, { status: 401 }));
    await expect(client.recentActivities()).rejects.toBeInstanceOf(GarminAuthError);
  });

  it("maps a 429 to GarminRateLimitError with its Retry-After", async () => {
    const { client } = clientAnswering(json({}, { status: 429, headers: { "retry-after": "300" } }));
    await expect(client.recentActivities()).rejects.toMatchObject({
      name: "GarminRateLimitError",
      retryAfterSeconds: 300,
    });
    const noHeader = clientAnswering(json({}, { status: 429 })).client;
    const error = await noHeader.recentActivities().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GarminRateLimitError);
    expect(error).toMatchObject({ retryAfterSeconds: null });
  });

  it("maps other failures to BridgeError with the status", async () => {
    const { client } = clientAnswering(json({ code: "upstream" }, { status: 502 }));
    await expect(client.dailySignals("2026-11-16")).rejects.toMatchObject({ name: "BridgeError", status: 502 });
  });

  it("reports an unreachable bridge or a timeout", async () => {
    const { client } = clientAnswering(new DOMException("timed out", "TimeoutError"));
    await expect(client.recentActivities()).rejects.toBeInstanceOf(BridgeUnreachableError);
  });

  it("rejects a response that does not match the schema", async () => {
    await expect(clientAnswering(json([{ id: "42" }])).client.recentActivities()).rejects.toBeInstanceOf(
      BridgeInvalidResponseError,
    );
    await expect(
      clientAnswering(new Response("not json", { status: 200 })).client.recentActivities(),
    ).rejects.toBeInstanceOf(BridgeInvalidResponseError);
  });
});
