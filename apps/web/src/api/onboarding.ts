import {
  type Feasibility,
  type FeasibilityInput,
  feasibilitySchema,
  onboardingStatusSchema,
  type ProfilePatch,
  type Program,
  timetableStatusSchema,
  watchInfoSchema,
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
  /** Whether the server reaches her Garmin (Darius links it before she starts). */
  watchLinked(): Promise<boolean>;
  /** Saves and reads the link she pasted; a feed that cannot be read yet keeps the link, Programme says why. */
  linkTimetable(url: string): Promise<void>;
  saveProgram(program: Program): Promise<void>;
  /** What she answered; the rest keeps the server's defaults. */
  saveProfile(profile: ProfilePatch): Promise<void>;
}

const request = (method: string, path: string, body?: unknown) =>
  fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function send(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await request(method, path, body);
  if (!response.ok) throw new Error(`${method} ${path} : ${response.status}`);
  return response.json();
}

export const httpOnboardingApi: OnboardingApi = {
  done: async () => onboardingStatusSchema.parse(await send("GET", "/onboarding")).done,
  feasibility: async (input) => feasibilitySchema.parse(await send("POST", "/feasibility", input)).verdict,
  timetableLinked: async () => timetableStatusSchema.parse(await send("GET", "/timetable")).lastSyncAt !== null,
  watchLinked: async () => watchInfoSchema.parse(await send("GET", "/watch")).configured,
  linkTimetable: async (url) => {
    const response = await request("PUT", "/timetable/url", { url });
    // 502: the link is stored, only its feed could not be read yet (Programme says why).
    if (!response.ok && response.status !== 502) throw new Error(`PUT /timetable/url : ${response.status}`);
  },
  saveProgram: async (program) => void (await send("PUT", "/program", program)),
  saveProfile: async (profile) => void (await send("PATCH", "/profile", profile)),
};

/** The mock shows onboarding only with `?onboarding`, so demos and Lighthouse land on Aujourd'hui. */
export function createMockOnboardingApi(search = ""): OnboardingApi {
  const ok = async () => undefined;
  return {
    done: async () => !new URLSearchParams(search).has("onboarding"),
    feasibility: async ({ distanceM, targetMin }) => (targetMin < distanceM / 200 ? "ambitieux" : "atteignable"),
    timetableLinked: async () => true,
    watchLinked: async () => true,
    linkTimetable: ok,
    saveProgram: ok,
    saveProfile: ok,
  };
}

export async function onboardingApi(): Promise<OnboardingApi> {
  return (await api()).mode === "server" ? httpOnboardingApi : createMockOnboardingApi(location.search);
}
