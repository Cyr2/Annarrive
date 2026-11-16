import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Health } from "@talaria/protocol";
import { Hono } from "hono";

export const VERSION = "0.1.0";

/** The API, plus the built PWA when `webDist` is given (one container serves both). */
export function createApp(options: { webDist?: string } = {}): Hono {
  const app = new Hono();

  app.get("/api/health", (c) => c.json<Health>({ status: "ok", version: VERSION }));
  app.all("/api/*", (c) => c.json({ error: "Route inconnue" }, 404));

  const { webDist } = options;
  if (webDist) {
    app.use("/*", serveStatic({ root: webDist }));
    // Client-side routes all land on the app shell.
    app.get("/*", async (c) => c.html(await readFile(join(webDist, "index.html"), "utf8")));
  }

  return app;
}
