import { describe, expect, it, vi } from "vitest";
import type { Api } from "../api/client.ts";
import { preloadable } from "./useLoad.ts";

vi.mock("../api/index.ts", () => ({ api: async () => ({}) }));

describe("preloadable", () => {
  it("serves the read a finger started to the sheet that opens, once", async () => {
    const load = vi.fn(async (_api: Api, id: string) => `slots of ${id}`);
    const slots = preloadable(load);
    const early = slots.start("run");
    expect(slots.start("run")).toBe(early);
    expect(await early.promise).toBe("slots of run");
    expect(slots.ready("run")).toBe("slots of run");
    expect(load).toHaveBeenCalledOnce();
    slots.forget("run");
    expect(slots.ready("run")).toBeUndefined();
    await slots.start("run").promise;
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("forgets a failed read and one too old to trust", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const load = vi.fn<(api: Api, id: string) => Promise<string>>().mockRejectedValueOnce(new Error("offline"));
    load.mockResolvedValue("ok");
    const slots = preloadable(load);
    await expect(slots.start("run").promise).rejects.toThrow("offline");
    expect(await slots.start("run").promise).toBe("ok");
    vi.setSystemTime(Date.now() + 30_000);
    expect(slots.ready("run")).toBeUndefined();
    vi.useRealTimers();
  });
});
