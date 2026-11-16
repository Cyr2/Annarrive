import { readFile } from "node:fs/promises";
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

const ICS_HOST = "https://ics.e2e.test/";
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith(ICS_HOST)) return realFetch(input, init);
  const file = join(process.env.E2E_ICS_DIR ?? ".", basename(new URL(url).pathname));
  const body = await readFile(file).catch(() => null);
  return body
    ? new Response(body, { headers: { "content-type": "text/calendar" } })
    : new Response("", { status: 404 });
};
