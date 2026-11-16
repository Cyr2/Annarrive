import { describe, expect, it, vi } from "vitest";
import { createHttpApi, isHealthy, ndjson } from "./http.ts";
import { mockRequest, pickApi } from "./index.ts";
import { createMockApi } from "./mock/index.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("api selection", () => {
  it("reads the mock flag and scenario", () => {
    expect(mockRequest("", undefined)).toBeUndefined();
    expect(mockRequest("", "1")).toBe("run");
    expect(mockRequest("?mock", undefined)).toBe("run");
    expect(mockRequest("?mock=rest", undefined)).toBe("rest");
    expect(mockRequest("?mock=nimporte", undefined)).toBe("run");
  });

  it("uses the server when its health check answers", async () => {
    const fetcher = vi.fn(async () => json({ status: "ok", version: "1" }));
    expect((await pickApi("", fetcher)).mode).toBe("server");
  });

  it("falls back to the mock when nothing, or not the server, answers", async () => {
    expect(
      (
        await pickApi(
          "",
          vi.fn(async () => new Response("<html>", { status: 200 })),
        )
      ).mode,
    ).toBe("mock");
    expect(
      (
        await pickApi(
          "",
          vi.fn(async () => json({ hello: 1 })),
        )
      ).mode,
    ).toBe("mock");
    expect(
      (
        await pickApi(
          "",
          vi.fn(() => Promise.reject(new Error("offline"))),
        )
      ).mode,
    ).toBe("mock");
    expect((await pickApi("?mock=done", vi.fn())).mode).toBe("mock");
    expect(isHealthy({ status: "ok", version: "2" })).toBe(true);
  });
});

describe("http client", () => {
  it("validates what the server sends", async () => {
    const mock = createMockApi({ monday: "2026-11-16" });
    const today = await mock.today();
    const fetcher = vi.fn(async () => json(today));
    const api = createHttpApi(fetcher);
    expect(await api.today()).toEqual(today);
    expect(fetcher).toHaveBeenCalledWith("/api/today", expect.objectContaining({ method: "GET" }));

    const broken = createHttpApi(vi.fn(async () => json({ date: "pas une date" })));
    await expect(broken.today()).rejects.toThrow();
    const failing = createHttpApi(vi.fn(async () => json({}, 500)));
    await expect(failing.week(0)).rejects.toThrow("GET /week?offset=0 : 500");
  });

  it("sends changes as JSON with escaped ids", async () => {
    const change = { changeId: "c1", message: "ok", rows: [] };
    const fetcher = vi.fn(async () => json(change));
    const api = createHttpApi(fetcher);
    await api.move("a/b", { date: "2026-11-18", start: "18:00" });
    expect(fetcher).toHaveBeenCalledWith(
      "/api/items/a%2Fb/move",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ date: "2026-11-18", start: "18:00" }) }),
    );
    await api.undo("c1");
    await api.change("s1", "jog");
    await api.deleteEvent("e1", "all");
    expect(fetcher).toHaveBeenLastCalledWith("/api/events/e1?scope=all", expect.objectContaining({ method: "DELETE" }));
  });

  it("streams Reggie's answer line by line", async () => {
    const lines = [
      JSON.stringify({ type: "status", status: "searching" }),
      JSON.stringify({ type: "message", message: { id: "1", role: "reggie", text: "Salut" } }),
    ];
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(`${lines[0]}\n${lines[1]?.slice(0, 10)}`));
        controller.enqueue(encoder.encode(lines[1]?.slice(10) ?? ""));
        controller.close();
      },
    });
    const api = createHttpApi(vi.fn(async () => new Response(body)));
    const events = [];
    for await (const event of api.chat({ text: "Salut" })) events.push(event);
    expect(events.map((e) => e.type)).toEqual(["status", "message"]);
  });

  it("splits newline-delimited JSON", async () => {
    const body = new Response('{"a":1}\n\n{"b":2}\n').body;
    if (!body) throw new Error("no body");
    const out = [];
    for await (const line of ndjson(body)) out.push(line);
    expect(out).toEqual([{ a: 1 }, { b: 2 }]);
  });
});
