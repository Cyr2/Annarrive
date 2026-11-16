import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { healthSchema } from "@talaria/protocol";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.ts";

describe("server", () => {
  it("answers the health check", async () => {
    const response = await createApp().request("/api/health");
    expect(response.status).toBe(200);
    expect(healthSchema.parse(await response.json()).status).toBe("ok");
  });

  it("returns a French 404 for an unknown API route", async () => {
    const response = await createApp().request("/api/nope");
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Route inconnue" });
  });

  it("serves the app shell for client-side routes", async () => {
    const webDist = await mkdtemp(join(tmpdir(), "talaria-web-"));
    await writeFile(join(webDist, "index.html"), "<!doctype html><title>Talaria</title>");
    const response = await createApp({ webDist }).request("/semaine");
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Talaria");
  });
});
