import { createHash } from "node:crypto";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP, type LookupFunction } from "node:net";
import type { DatabaseSync } from "node:sqlite";
import type { CalendarEvent, TimetableRefresh, TimetableStatus } from "@annarrive/protocol";
import { sync as ical } from "node-ical";
import { z } from "zod";
import { TimetableError, TimetableNotConfiguredError } from "../errors.ts";
import { transaction } from "../storage/db.ts";
import type { Stores } from "../storage/stores.ts";
import { type Clock, dateOf, frenchWeekday, toParisLocal } from "../time.ts";
import type { PlanService } from "./plan.ts";

const LAST_SYNC = "timetable.lastSyncAt";
/** What the last read that changed something said, and when: the app shows it after a read in the background. */
const LAST_CHANGE = "timetable.lastChange";
const LAST_CHANGE_AT = "timetable.lastChangeAt";
const textSchema = z.union([z.string(), z.object({ val: z.string() }).transform((v) => v.val)]);
const vevent = z.object({
  type: z.literal("VEVENT"),
  uid: z.string().min(1).optional(),
  start: z.date(),
  end: z.date(),
  summary: textSchema.optional(),
  location: textSchema.optional(),
});

/** What makes two classes one, whatever their UID: ADE can hand new UIDs on each export (same key as the unique index of db.ts). */
const classKey = (e: Pick<CalendarEvent, "title" | "start" | "end">) => `${e.title}\u0000${e.start}\u0000${e.end}`;

/** Keeps the VEVENTs of an ICS feed as classes, in Paris time. Throws rather than drop a class silently. */
export function parseTimetable(ics: string): CalendarEvent[] {
  const components = Object.values(ical.parseICS(ics)).filter((c) => c?.type === "VEVENT");
  return components.map((component) => {
    const parsed = vevent.safeParse(component);
    if (!parsed.success)
      throw new TimetableError("L'emploi du temps reçu est illisible : rien n'a changé, réessaie plus tard.");
    const e = parsed.data;
    const title = e.summary?.trim() || "Cours";
    const start = toParisLocal(e.start);
    const end = toParisLocal(e.end);
    return {
      id: `ics:${e.uid ?? createHash("sha256").update(classKey({ title, start, end })).digest("hex").slice(0, 32)}`,
      kind: "class",
      title,
      start,
      end,
      location: e.location?.trim() || undefined,
      manual: false,
      cancelled: false,
      recurrence: "none",
      exceptions: [],
    };
  });
}

// The link is typed by Anna: it must never reach the server's own network (bridge, Coolify, cloud metadata).
const internal = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 3],
] as const)
  internal.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  internal.addSubnet(net, prefix, "ipv6");

/** False for loopback, private, link-local, shared, multicast and IPv4-embedding IPv6 addresses. */
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  return version !== 0 && !internal.check(address, version === 4 ? "ipv4" : "ipv6");
}

const INTERNAL_LINK = "Ce lien mène à une adresse interne : colle le lien d'abonnement public de ton emploi du temps.";
const UNREACHABLE = "L'emploi du temps ne répond pas : réessaie dans quelques minutes.";

type Resolve = (hostname: string, callback: (error: Error | null, addresses: LookupAddress[]) => void) => void;
const systemResolve: Resolve = (hostname, callback) => dnsLookup(hostname, { all: true }, callback);

/** Every address the name resolves to must be public; the connection then uses them, so a rebinding DNS cannot swap one in. */
function guardedLookup(resolve: Resolve): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname, (error, addresses) => {
      // On a failure, Node hands no address list at all.
      const first = error ? undefined : addresses[0];
      if (error || !first) return callback(error ?? new TimetableError(UNREACHABLE), "");
      if (!addresses.every((a) => isPublicAddress(a.address))) return callback(new TimetableError(INTERNAL_LINK), "");
      if (options.all) return callback(null, addresses);
      callback(null, first.address, first.family);
    });
  };
}

type Transport = (
  url: URL,
  options: { lookup: LookupFunction; signal: AbortSignal },
  callback: (res: IncomingMessage) => void,
) => ClientRequest;

export type IcsFetcherOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  resolve?: Resolve;
  /** `https.request`; tests swap in a local server. */
  transport?: Transport;
};

/**
 * Downloads a feed over https only, never from an internal address, within `timeoutMs` and `maxBytes`, following
 * at most `maxRedirects` redirects that pass the same checks. The URL is a secret: it never appears in an error.
 */
export function icsFetcher({
  timeoutMs = 15_000,
  maxBytes = 5_000_000,
  maxRedirects = 3,
  resolve = systemResolve,
  transport = httpsRequest,
}: IcsFetcherOptions = {}): (url: string) => Promise<string> {
  const lookup = guardedLookup(resolve);
  const get = (url: string, redirectsLeft: number, signal: AbortSignal): Promise<string> => {
    const target = URL.parse(url);
    if (target?.protocol !== "https:")
      return Promise.reject(new TimetableError("Le lien de l'emploi du temps doit commencer par https://."));
    const literal = target.hostname.replace(/^\[|\]$/g, "");
    // An IP in the URL skips the lookup, so it is checked here.
    if (isIP(literal) && !isPublicAddress(literal)) return Promise.reject(new TimetableError(INTERNAL_LINK));
    return new Promise((done, fail) => {
      const req = transport(target, { lookup, signal }, (res) => {
        answer(res, target, redirectsLeft, signal).then(done, fail);
      });
      req.on("error", (error) => fail(asTimetableError(error)));
      req.end();
    });
  };
  /** The body of a 2xx, the next hop of a redirect (checked like the first), an error otherwise. */
  const answer = (res: IncomingMessage, from: URL, redirectsLeft: number, signal: AbortSignal): Promise<string> => {
    const status = res.statusCode ?? 0;
    const location = status >= 300 && status < 400 ? res.headers.location : undefined;
    if (location === undefined && status >= 200 && status < 300) return readCapped(res, maxBytes);
    res.resume();
    if (location === undefined) {
      // The status code stays in the logs: Anna cannot act on it.
      console.warn(`Emploi du temps : réponse ${status}`);
      return Promise.reject(
        new TimetableError("Ton emploi du temps ne répond pas à ce lien : vérifie-le dans Programme."),
      );
    }
    if (redirectsLeft === 0)
      return Promise.reject(
        new TimetableError("Ton emploi du temps redirige trop de fois : vérifie le lien dans Programme."),
      );
    return get(new URL(location, from).toString(), redirectsLeft - 1, signal);
  };
  return (url) => get(url, maxRedirects, AbortSignal.timeout(timeoutMs));
}

const asTimetableError = (error: unknown) =>
  error instanceof TimetableError ? error : new TimetableError(UNREACHABLE);

/** The body as text, cut off past `maxBytes` so a huge or endless feed cannot fill the memory. */
function readCapped(res: IncomingMessage, maxBytes: number): Promise<string> {
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    res.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= maxBytes) return chunks.push(chunk);
      fail(new TimetableError("Ton emploi du temps est trop gros pour être lu : vérifie le lien dans Programme."));
      res.destroy();
    });
    res.on("end", () => done(Buffer.concat(chunks).toString("utf8")));
    res.on("error", (error) => fail(asTimetableError(error)));
  });
}

type Verb = "annulé" | "ajouté" | "modifié";

/** "2 cours annulés jeudi · 1 cours ajouté lundi" */
export function diffSummary(lines: { verb: Verb; date: string }[]): string {
  const counts = new Map<string, number>();
  for (const verb of ["annulé", "ajouté", "modifié"] as const) {
    for (const line of lines.filter((l) => l.verb === verb).sort((a, b) => a.date.localeCompare(b.date))) {
      const key = `${verb}${"\u0000"}${frenchWeekday(line.date)}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([key, n]) => {
      const [verb, day] = key.split("\u0000");
      return `${n} cours ${verb}${n > 1 ? "s" : ""} ${day}`;
    })
    .join(" · ");
}

const sameClass = (a: CalendarEvent, b: CalendarEvent) =>
  a.start === b.start && a.end === b.end && a.title === b.title && a.location === b.location;

export class TimetableService {
  readonly #db: DatabaseSync;
  readonly #stores: Stores;
  readonly #plan: PlanService;
  readonly #clock: Clock;
  readonly #fetch: (url: string) => Promise<string>;
  readonly #envUrl: string | undefined;

  constructor(
    db: DatabaseSync,
    stores: Stores,
    plan: PlanService,
    clock: Clock,
    fetchIcs: (url: string) => Promise<string>,
    envUrl?: string,
  ) {
    this.#db = db;
    this.#stores = stores;
    this.#plan = plan;
    this.#clock = clock;
    this.#fetch = fetchIcs;
    this.#envUrl = envUrl;
  }

  status(): TimetableStatus {
    const summary = this.#stores.meta.get(LAST_CHANGE)?.value;
    const at = this.#stores.meta.get(LAST_CHANGE_AT)?.value;
    return {
      lastSyncAt: this.#stores.meta.get(LAST_SYNC)?.value ?? null,
      ...(summary && at ? { lastChange: { at, summary } } : {}),
    };
  }

  /** The link Anna pasted in Programme wins over the server's `ICS_URL`. */
  url(): string | undefined {
    return this.#plan.profile().icsUrl ?? this.#envUrl;
  }

  /** Saves Anna's link (undoable like any setting), then reads it at once. */
  async setUrl(url: string): Promise<TimetableRefresh> {
    this.#plan.saveIcsUrl(url);
    return this.refresh();
  }

  async refresh(): Promise<TimetableRefresh> {
    const url = this.url();
    if (!url) throw new TimetableNotConfiguredError();
    const feed = parseTimetable(await this.#fetch(url));
    // An empty feed is far more likely an outage than a semester without classes.
    if (feed.length === 0)
      throw new TimetableError("L'emploi du temps reçu est vide : rien n'a changé, réessaie plus tard.");
    const before = this.#plan.coachState();
    const lines = transaction(this.#db, () => this.#apply(feed, toParisLocal(this.#clock())));
    const lastSyncAt = this.#clock().toISOString();
    this.#stores.meta.put({ id: LAST_SYNC, value: lastSyncAt });

    const classes = diffSummary(lines);
    const replan = lines.length > 0 ? await this.#plan.replanAfterTimetable(before, classes) : { change: null };
    const count = (verb: Verb) => lines.filter((l) => l.verb === verb).length;
    const summary = replan.change?.summary ?? classes;
    if (summary) {
      this.#stores.meta.put({ id: LAST_CHANGE, value: summary });
      this.#stores.meta.put({ id: LAST_CHANGE_AT, value: lastSyncAt });
    }
    return {
      lastSyncAt,
      added: count("ajouté"),
      changed: count("modifié"),
      removed: count("annulé"),
      summary,
      change: replan.change,
    };
  }

  /**
   * Upserts upcoming classes and deletes the ones gone from the feed; past classes stay as they were. A class is
   * found by its UID, else by title and times, and keeps its stored id: her « n'a pas lieu » and Annuler hold on to it.
   */
  #apply(feed: CalendarEvent[], now: string): { verb: Verb; date: string }[] {
    const store = this.#stores.calendarEvent;
    const stored = store.list().filter((e) => e.kind === "class" && !e.manual);
    const byId = new Map(stored.map((e) => [e.id, e]));
    const byKey = new Map(stored.map((e) => [classKey(e), e]));
    const unread = new Map(stored.filter((e) => e.end > now).map((e) => [e.id, e]));
    const find = (e: CalendarEvent) => byId.get(e.id) ?? byKey.get(classKey(e));
    // A class listed twice in the feed is one class.
    const classes = [...new Map(feed.map((e) => [classKey(e), e])).values()];
    const lines: { verb: Verb; date: string }[] = [];
    // Past classes only fill an empty history, so the week view of a past week still shows them.
    for (const event of classes.filter((e) => e.end <= now && !find(e))) store.put(event);
    for (const event of classes.filter((e) => e.end > now)) {
      const old = find(event);
      if (old) unread.delete(old.id);
      if (old && sameClass(old, event)) continue;
      lines.push({ verb: old ? "modifié" : "ajouté", date: dateOf(event.start) });
      store.put({ ...event, id: old?.id ?? event.id, cancelled: old?.cancelled ?? false });
    }
    for (const gone of unread.values()) {
      lines.push({ verb: "annulé", date: dateOf(gone.start) });
      store.delete(gone.id);
    }
    return lines;
  }
}
