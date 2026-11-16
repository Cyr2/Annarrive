import { beforeEach, describe, expect, it, vi } from "vitest";
import { DONE_KEY, isOnboarded, needsOnboarding } from "./done.ts";

const server = vi.hoisted(() => ({ done: vi.fn<() => Promise<boolean>>() }));
vi.mock("../../api/onboarding.ts", () => ({ onboardingApi: async () => server }));

describe("needsOnboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    server.done.mockReset();
  });

  it("never asks the server again once this phone saw it end", async () => {
    localStorage.setItem(DONE_KEY, "done");
    expect(await needsOnboarding()).toBe(false);
    expect(server.done).not.toHaveBeenCalled();
  });

  it("remembers a server that says it is done", async () => {
    server.done.mockResolvedValue(true);
    expect(await needsOnboarding()).toBe(false);
    expect(isOnboarded()).toBe(true);
  });

  it("shows onboarding when the server says so, and not when it cannot answer", async () => {
    server.done.mockResolvedValue(false);
    expect(await needsOnboarding()).toBe(true);
    server.done.mockRejectedValue(new Error("offline"));
    expect(await needsOnboarding()).toBe(false);
    expect(isOnboarded()).toBe(false);
  });
});
