import type { Api } from "./client.ts";
import type { Scenario } from "./mock/index.ts";
import { signOut } from "./session.ts";

export type { Api } from "./client.ts";

const SCENARIOS: Scenario[] = ["run", "rest", "done", "light", "worst"];

/** `?mock`, `?mock=rest`, `?mock=done`, `?mock=light`, `?mock=worst`: forces the mock and picks its "today". */
export function mockRequest(search: string, envFlag: string | undefined): Scenario | undefined {
  const value = new URLSearchParams(search).get("mock");
  if (value === null) return envFlag === "1" ? "run" : undefined;
  return SCENARIOS.find((s) => s === value) ?? "run";
}

/** The health check body when something JSON answers, unvalidated: zod only loads with the HTTP client. */
async function healthBody(fetcher: typeof fetch): Promise<unknown> {
  try {
    const response = await fetcher("/api/health", { signal: AbortSignal.timeout(2500) });
    const json = response.headers.get("content-type")?.includes("application/json");
    return response.ok && json ? await response.json() : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The mock only with `?mock`, or in development when no server answers its health check; in production the
 * app always talks to its own server. Both load on demand, so the first screen's file carries neither zod nor the mock data.
 */
export async function pickApi(
  search = location.search,
  fetcher: typeof fetch = fetch,
  dev: boolean = import.meta.env.DEV,
): Promise<Api> {
  const forced = mockRequest(search, import.meta.env.VITE_API_MOCK);
  if (!forced) {
    const health = dev ? await healthBody(fetcher) : undefined;
    const http = await import("./http.ts");
    if (!dev || http.isHealthy(health)) return http.createHttpApi(fetcher, signOut);
  }
  const { createMockApi } = await import("./mock/index.ts");
  return createMockApi({ scenario: forced ?? "run", latencyMs: 150 });
}

let current: Promise<Api> | undefined;

export function api(): Promise<Api> {
  current ??= pickApi();
  return current;
}
