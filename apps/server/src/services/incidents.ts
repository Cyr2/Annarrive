import { randomUUID } from "node:crypto";
import { type IncidentInput, redact } from "@annarrive/protocol";
import type { Incident, Stores } from "../storage/stores.ts";
import { type Clock, toParisLocal } from "../time.ts";

/** Kept 30 days, then dropped by the nightly job (architecture.md, « Journal des incidents »). */
export const INCIDENT_DAYS = 30;
/** A looping or hostile client cannot fill the disk: only the latest rows stay. */
export const MAX_INCIDENTS = 500;
const DAY_MS = 86_400_000;

/** The incident journal: what broke on Anna's phone or on the server, for Darius to read with `cli/incidents.ts`. */
export class IncidentService {
  readonly #stores: Stores;
  readonly #clock: Clock;

  constructor(stores: Stores, clock: Clock) {
    this.#stores = stores;
    this.#clock = clock;
  }

  /** What the phone sent, redacted once more: an older or a tampered client must not store a secret. */
  record(inputs: IncidentInput[], userId: string | undefined): void {
    for (const input of inputs)
      this.#put({
        ...input,
        clientAt: input.at,
        message: redact(input.message),
        stack: input.stack === undefined ? undefined : redact(input.stack),
        route: redact(input.route),
        breadcrumbs: input.breadcrumbs.map((b) => ({ ...b, label: redact(b.label) })),
        userId,
      });
  }

  /** An unexpected error of a route: its name, message and stack, never the request's body. */
  recordServerError(route: string, error: Error): void {
    this.#put({
      type: "server",
      message: redact(`${error.name}: ${error.message}`).slice(0, 1000),
      stack: error.stack === undefined ? undefined : redact(error.stack).slice(0, 8000),
      route: redact(route).slice(0, 200),
      breadcrumbs: [],
    });
  }

  /** Newest first. */
  list(since: Date): Incident[] {
    return this.#stores.incident.overlapping(since.toISOString(), "9999").reverse();
  }

  get(id: string): Incident | undefined {
    return this.#stores.incident.get(id);
  }

  purge(): void {
    this.#stores.incident.deleteBefore(new Date(this.#clock().getTime() - INCIDENT_DAYS * DAY_MS).toISOString());
  }

  #put(incident: Omit<Incident, "id" | "at">): void {
    this.#stores.incident.put({ ...incident, id: randomUUID().slice(0, 8), at: this.#clock().toISOString() });
    this.#stores.incident.keepLatest(MAX_INCIDENTS);
  }
}

/** `2d`, `12h`, `30m`: how far back the CLI looks. */
export function sinceDate(text: string, now: Date): Date {
  const match = /^(\d+)([dhm])$/.exec(text);
  if (!match) throw new Error(`Durée illisible : « ${text} ». Exemples : 2d, 12h, 30m.`);
  const unit = match[2] === "d" ? DAY_MS : match[2] === "h" ? 3_600_000 : 60_000;
  return new Date(now.getTime() - Number(match[1]) * unit);
}

/** "2026-11-18 20:31:05" in Paris time; a phone's clock that does not parse is shown as sent. */
const paris = (iso: string) => {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return iso;
  return `${toParisLocal(instant).replace("T", " ")}:${String(instant.getUTCSeconds()).padStart(2, "0")}`;
};

/** One incident as Darius reads it: what, where, on which phone, then her last gestures in order. */
export function formatIncident(incident: Incident): string {
  const { device: d } = incident;
  const lines = [`#${incident.id}  ${paris(incident.at)}  ${incident.type}  ${incident.message}`];
  const where = [incident.userId ?? "sans compte", incident.route];
  if (d)
    where.push(
      `${d.os}${d.standalone ? " PWA" : " navigateur"}`,
      d.version,
      d.timezone,
      d.viewport,
      d.online ? "en ligne" : "hors ligne",
    );
  lines.push(`  ${where.join(" · ")}`);
  if (d) lines.push(`  ${d.userAgent}`);
  if (incident.stack) lines.push("  Pile :", ...incident.stack.split("\n").map((l) => `    ${l.trim()}`));
  if (incident.breadcrumbs.length > 0)
    lines.push(
      "  Derniers gestes :",
      ...incident.breadcrumbs.map((b) => `    ${paris(b.at).slice(11, 19)}  ${b.kind.padEnd(5)}  ${b.label}`),
    );
  return lines.join("\n");
}
