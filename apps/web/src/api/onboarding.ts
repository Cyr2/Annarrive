import {
  type CreateEventInput,
  type Feasibility,
  type FeasibilityInput,
  feasibilitySchema,
  onboardingStatusSchema,
  type Profile,
  type Program,
  pushKeySchema,
  timetableStatusSchema,
  type Unavailable,
} from "@annarrive/protocol";
import { api } from "./index.ts";

/**
 * What onboarding asks the server, apart from the `Api` of the other screens: it speaks the server's own
 * protocol (routes of apps/server/src/routes/plan.ts). Loaded only with the onboarding chunk.
 */
export interface OnboardingApi {
  done(): Promise<boolean>;
  feasibility(input: FeasibilityInput): Promise<Feasibility["verdict"]>;
  timetableLinked(): Promise<boolean>;
  saveProgram(program: Program): Promise<void>;
  saveProfile(profile: Profile): Promise<void>;
  addEvent(event: CreateEventInput): Promise<void>;
  reportPain(pain: Unavailable): Promise<void>;
  /** The VAPID key, null when the server sends no notifications. */
  pushKey(): Promise<string | null>;
  subscribe(subscription: PushSubscriptionJSON): Promise<void>;
}

async function send(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${method} ${path} : ${response.status}`);
  return response.json();
}

export const httpOnboardingApi: OnboardingApi = {
  done: async () => onboardingStatusSchema.parse(await send("GET", "/onboarding")).done,
  feasibility: async (input) => feasibilitySchema.parse(await send("POST", "/feasibility", input)).verdict,
  timetableLinked: async () => timetableStatusSchema.parse(await send("GET", "/timetable")).lastSyncAt !== null,
  saveProgram: async (program) => void (await send("PUT", "/program", program)),
  saveProfile: async (profile) => void (await send("PATCH", "/profile", profile)),
  addEvent: async (event) => void (await send("POST", "/events", event)),
  reportPain: async (pain) => void (await send("POST", "/unavailable", pain)),
  pushKey: async () => pushKeySchema.parse(await send("GET", "/push/key")).publicKey,
  subscribe: async (subscription) => void (await send("POST", "/push/subscriptions", subscription)),
};

/** The mock shows onboarding only with `?onboarding`, so demos and Lighthouse land on Aujourd'hui. */
export function createMockOnboardingApi(search = ""): OnboardingApi {
  const ok = async () => undefined;
  return {
    done: async () => !new URLSearchParams(search).has("onboarding"),
    feasibility: async ({ distanceM, targetMin }) => (targetMin < distanceM / 200 ? "ambitieux" : "atteignable"),
    timetableLinked: async () => true,
    saveProgram: ok,
    saveProfile: ok,
    addEvent: ok,
    reportPain: ok,
    pushKey: async () => null,
    subscribe: ok,
  };
}

export async function onboardingApi(): Promise<OnboardingApi> {
  return (await api()).mode === "server" ? httpOnboardingApi : createMockOnboardingApi(location.search);
}
