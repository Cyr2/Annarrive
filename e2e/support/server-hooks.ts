import { readFile } from "node:fs/promises";
import { createServer, request as httpRequest } from "node:http";
import https from "node:https";
import { syncBuiltinESMExports } from "node:module";
import type { AddressInfo } from "node:net";
import { basename, join } from "node:path";

/**
 * Preloaded into the server and its CLI with `--import`: the clock starts at `E2E_NOW` and keeps running,
 * and `https://ics.e2e.test/<file>` reads `<file>` from `E2E_ICS_DIR` (the app only accepts https links).
 */
const RealDate = Date;
const offset = RealDate.parse(process.env.E2E_NOW ?? "") - RealDate.now();
if (Number.isNaN(offset)) throw new Error("E2E_NOW manque : une date ISO, par exemple 2026-11-17T07:00:00Z.");

class ShiftedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) super(RealDate.now() + offset);
    else super(...(args as ConstructorParameters<DateConstructor>));
  }
  static override now(): number {
    return RealDate.now() + offset;
  }
}
globalThis.Date = ShiftedDate as DateConstructor;

// A local http server stands in for the https host, so the timetable's https-only and address guards still apply.
const ICS_HOST = "ics.e2e.test";
const icsServer = createServer(async (req, res) => {
  const file = join(process.env.E2E_ICS_DIR ?? ".", basename(new URL(req.url ?? "/", "http://x").pathname));
  const body = await readFile(file).catch(() => null);
  if (!body) return void res.writeHead(404).end();
  res.writeHead(200, { "content-type": "text/calendar" }).end(body);
});
await new Promise<void>((resolve) => icsServer.listen(0, "127.0.0.1", resolve));
icsServer.unref();
const { port } = icsServer.address() as AddressInfo;

const realRequest = https.request;
https.request = ((...args: Parameters<typeof https.request>) => {
  const [url, options, callback] = args;
  if (!(url instanceof URL) || url.hostname !== ICS_HOST) return realRequest(...args);
  const { signal } = options as { signal?: AbortSignal };
  return httpRequest({ host: "127.0.0.1", port, path: url.pathname, signal }, callback);
}) as typeof https.request;
syncBuiltinESMExports();
