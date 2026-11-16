import type { Api } from "./client.ts";
import type { Scenario } from "./mock/index.ts";

export type { Api } from "./client.ts";

const SCENARIOS: Scenario[] = ["run", "rest", "done", "light"];

/** `?mock`, `?mock=rest`, `?mock=done`, `?mock=light`: forces the mock and picks which "today" it shows. */
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
 * The real server when it answers its health check, otherwise the in-memory mock. Both load on demand,
 * so the first screen's file carries neither zod nor the mock data.
 */
export async function pickApi(search = location.search, fetcher: typeof fetch = fetch): Promise<Api> {
  const forced = mockRequest(search, import.meta.env.VITE_API_MOCK);
  const health = forced ? undefined : await healthBody(fetcher);
  if (health !== undefined) {
    const http = await import("./http.ts");
    if (http.isHealthy(health)) return http.createHttpApi(fetcher);
  }
  const { createMockApi } = await import("./mock/index.ts");
  return createMockApi({ scenario: forced ?? "run", latencyMs: 150 });
}

let current: Promise<Api> | undefined;

export function api(): Promise<Api> {
  current ??= pickApi();
  return current;
}
