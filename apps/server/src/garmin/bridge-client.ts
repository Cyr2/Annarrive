import {
  type CreatedWorkout,
  createdWorkoutSchema,
  type GarminActivity,
  type GarminDailySignals,
  type GarminLap,
  garminActivitySchema,
  garminDailySignalsSchema,
  garminLapSchema,
  type WorkoutRequest,
  workoutRequestSchema,
} from "@annarrive/protocol";
import { z } from "zod";

export class BridgeError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = new.target.name;
  }
}
/** Garmin refused the session: a human must run `garmin-bridge-login` in the bridge container. */
export class GarminAuthError extends BridgeError {}
export class GarminRateLimitError extends BridgeError {
  constructor(readonly retryAfterSeconds: number | null) {
    super("Garmin limite les requêtes", 429);
  }
}
export class BridgeUnreachableError extends BridgeError {}
export class BridgeInvalidResponseError extends BridgeError {}
/** `GARMIN_WRITE=off`: a test instance reads Anna's account but never changes it. */
export class GarminWriteOffError extends BridgeError {}

export interface BridgeClientOptions {
  baseUrl?: string | undefined;
  secret?: string | undefined;
  // Above the bridge's own 15 s per Garmin call: a login may chain several.
  timeoutMs?: number;
  /** False: every request but a read is refused before it leaves the server. */
  write?: boolean;
  fetch?: typeof fetch;
}

export type BridgeClient = ReturnType<typeof createBridgeClient>;

export function createBridgeClient(options: BridgeClientOptions = {}) {
  const baseUrl = options.baseUrl ?? process.env.BRIDGE_URL;
  const secret = options.secret ?? process.env.BRIDGE_SECRET;
  const timeoutMs = options.timeoutMs ?? 60_000;
  const doFetch = options.fetch ?? fetch;
  const write = options.write ?? true;
  if (!baseUrl || !secret) throw new BridgeError("BRIDGE_URL et BRIDGE_SECRET sont requis");

  async function request(path: string, init: RequestInit): Promise<Response> {
    let response: Response;
    try {
      response = await doFetch(new URL(path, baseUrl), {
        ...init,
        headers: { "x-bridge-secret": secret ?? "", "content-type": "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new BridgeUnreachableError(`Bridge Garmin injoignable : ${String(error)}`);
    }
    if (response.ok) return response;
    if (response.status === 401) throw new GarminAuthError("Connexion Garmin refusée", 401);
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get("retry-after"));
      throw new GarminRateLimitError(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null);
    }
    throw new BridgeError(`Bridge Garmin : réponse ${response.status}`, response.status);
  }

  /** The one gate for every mutation: any method but GET would change her Garmin account. */
  async function send(path: string, init: RequestInit = {}): Promise<Response> {
    if (!write && (init.method ?? "GET") !== "GET") throw new GarminWriteOffError("Envoi vers Garmin coupé");
    return request(path, init);
  }

  async function get<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    const response = await send(path, init);
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw new BridgeInvalidResponseError(`Réponse inattendue du bridge sur ${path}`);
    return parsed.data;
  }

  return {
    recentActivities: (limit = 20): Promise<GarminActivity[]> =>
      get(`/activities?limit=${limit}`, z.array(garminActivitySchema)),
    activityLaps: (activityId: number): Promise<GarminLap[]> =>
      get(`/activities/${activityId}/laps`, z.array(garminLapSchema)),
    dailySignals: (date: string): Promise<GarminDailySignals> => get(`/daily/${date}`, garminDailySignalsSchema),
    createWorkout: async (request: WorkoutRequest): Promise<CreatedWorkout> =>
      get("/workouts", createdWorkoutSchema, {
        method: "POST",
        body: JSON.stringify(workoutRequestSchema.parse(request)),
      }),
    /** To update a scheduled workout: delete it, then create the new version. */
    deleteWorkout: async (workoutId: number): Promise<void> => {
      await send(`/workouts/${workoutId}`, { method: "DELETE" });
    },
  };
}
