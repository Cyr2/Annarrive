import { type ChildProcess, execFile, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/** Paris, Tuesday 17 November 2026 at 8:00: the fixtures and the tests are written for this morning. */
export const E2E_NOW = "2026-11-17T07:00:00Z";
/** Paris, Monday 23 November 2026 at 20:30: Anna opens the app for the first time (audit parcours réel). */
export const MONDAY_NOW = "2026-11-23T19:30:00Z";

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));
const ROOT = path("../../");
const HOOKS = new URL("./server-hooks.ts", import.meta.url).href;
export const ICS_DIR = path("../fixtures");
/** What a timetable link looks like to the server; `server-hooks.ts` reads the file instead. */
export const icsUrl = (file: string) => `https://ics.e2e.test/${file}`;

export type Server = { url: string; dataDir: string; now: string; stop: () => Promise<void> };

function env(port: number, dataDir: string, now = E2E_NOW): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORT: String(port),
    DATA_DIR: dataDir,
    WEB_DIST: `${ROOT}apps/web/dist`,
    PUBLIC_URL: `http://localhost:${port}`,
    SESSION_SECRET: randomBytes(32).toString("hex"),
    E2E_NOW: now,
    E2E_ICS_DIR: ICS_DIR,
    // No Garmin, no Reggie model, no push, no timetable but the one the tests give.
    BRIDGE_URL: "",
    BRIDGE_SECRET: "",
    ICS_URL: "",
    VAPID_PUBLIC_KEY: "",
    VAPID_PRIVATE_KEY: "",
    ANTHROPIC_API_KEY: "",
  };
}

/** Node with tsx (as `pnpm start`) and the test clock. */
const node = (script: string, ...args: string[]) => ["--import", "tsx", "--import", HOOKS, script, ...args];
const SERVER = `${ROOT}apps/server/src/`;

async function healthy(url: string, child: ChildProcess): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`Le serveur s'est arrêté (code ${child.exitCode}).`);
    const ok = await fetch(`${url}/api/health`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Le serveur ne répond pas après 20 s.");
}

/** The real server serving the built PWA from `apps/web/dist`; `now`: where its clock starts. */
export async function startServer(port: number, dataDir: string, now = E2E_NOW): Promise<Server> {
  const child = spawn(process.execPath, node(`${SERVER}index.ts`), {
    cwd: path(".."),
    env: env(port, dataDir, now),
    stdio: ["ignore", "inherit", "inherit"],
  });
  const url = `http://localhost:${port}`;
  await healthy(url, child);
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  return {
    url,
    dataDir,
    now,
    stop: () => {
      child.kill();
      return exited;
    },
  };
}

/** A one-time login link from the server's own CLI, as Darius makes them. */
export async function loginLink(server: Server): Promise<string> {
  const port = Number(new URL(server.url).port);
  const { stdout } = await promisify(execFile)(process.execPath, node(`${SERVER}cli/login-link.ts`), {
    cwd: path(".."),
    env: env(port, server.dataDir, server.now),
  });
  return stdout.trim();
}

/** A new password for `name` from the server's CLI (`users.ts password`), which creates the account. */
export async function newPassword(server: Server, name: string): Promise<string> {
  const port = Number(new URL(server.url).port);
  const { stdout } = await promisify(execFile)(process.execPath, node(`${SERVER}cli/users.ts`, "password", name), {
    cwd: path(".."),
    env: env(port, server.dataDir, server.now),
  });
  return stdout.trim().split(" : ")[1] ?? "";
}

/** Fills a new DATA_DIR before the server opens it (see `seed.ts`). */
export async function seed(dataDir: string, mode: "garmin" | "plan" | "monday", now = E2E_NOW): Promise<void> {
  await promisify(execFile)(process.execPath, node(path("./seed.ts"), dataDir, mode), {
    cwd: path(".."),
    env: env(0, dataDir, now),
  });
}
