import type { DatabaseSync } from "node:sqlite";
import type { CalendarEvent, TimetableRefresh, TimetableStatus } from "@talaria/protocol";
import { sync as ical } from "node-ical";
import { z } from "zod";
import { TimetableError, TimetableNotConfiguredError } from "../errors.ts";
import { transaction } from "../storage/db.ts";
import type { Stores } from "../storage/stores.ts";
import { type Clock, dateOf, frenchWeekday, toParisLocal } from "../time.ts";
import type { PlanService } from "./plan.ts";

const LAST_SYNC = "timetable.lastSyncAt";
const textSchema = z.union([z.string(), z.object({ val: z.string() }).transform((v) => v.val)]);
const vevent = z.object({
  type: z.literal("VEVENT"),
  uid: z.string().min(1),
  start: z.date(),
  end: z.date(),
  summary: textSchema.optional(),
  location: textSchema.optional(),
});

/** Keeps the VEVENTs of an ICS feed as classes, in Paris time. Throws rather than drop a class silently. */
export function parseTimetable(ics: string): CalendarEvent[] {
  const components = Object.values(ical.parseICS(ics)).filter((c) => c?.type === "VEVENT");
  return components.map((component) => {
    const parsed = vevent.safeParse(component);
    if (!parsed.success)
      throw new TimetableError("L'emploi du temps reçu est illisible : rien n'a changé, réessaie plus tard.");
    const e = parsed.data;
    return {
      id: `ics:${e.uid}`,
      kind: "class",
      title: e.summary?.trim() || "Cours",
      start: toParisLocal(e.start),
      end: toParisLocal(e.end),
      location: e.location?.trim() || undefined,
      manual: false,
      cancelled: false,
      recurrence: "none",
      exceptions: [],
    };
  });
}

/** Downloads the feed; the URL is a secret, so it never appears in an error. */
export function icsFetcher(url: string | undefined, timeoutMs = 15_000): () => Promise<string> {
  return async () => {
    if (!url) throw new TimetableNotConfiguredError();
    const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch(() => {
      throw new TimetableError("L'emploi du temps ne répond pas : réessaie dans quelques minutes.");
    });
    if (!response.ok) throw new TimetableError(`L'emploi du temps a répondu ${response.status} : vérifie le lien ICS.`);
    return response.text();
  };
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
  readonly #fetch: () => Promise<string>;

  constructor(db: DatabaseSync, stores: Stores, plan: PlanService, clock: Clock, fetchIcs: () => Promise<string>) {
    this.#db = db;
    this.#stores = stores;
    this.#plan = plan;
    this.#clock = clock;
    this.#fetch = fetchIcs;
  }

  status(): TimetableStatus {
    return { lastSyncAt: this.#stores.meta.get(LAST_SYNC)?.value ?? null };
  }

  async refresh(): Promise<TimetableRefresh> {
    const feed = parseTimetable(await this.#fetch());
    // An empty feed is far more likely an outage than a semester without classes.
    if (feed.length === 0)
      throw new TimetableError("L'emploi du temps reçu est vide : rien n'a changé, réessaie plus tard.");
    const before = this.#plan.coachState();
    const lines = transaction(this.#db, () => this.#apply(feed, toParisLocal(this.#clock())));
    const lastSyncAt = this.#clock().toISOString();
    this.#stores.meta.put({ id: LAST_SYNC, value: lastSyncAt });

    const classes = diffSummary(lines);
    const replan = lines.length > 0 ? this.#plan.replanAfterTimetable(before, classes) : { change: null };
    const count = (verb: Verb) => lines.filter((l) => l.verb === verb).length;
    return {
      lastSyncAt,
      added: count("ajouté"),
      changed: count("modifié"),
      removed: count("annulé"),
      summary: replan.change?.summary ?? classes,
      change: replan.change,
    };
  }

  /** Upserts upcoming classes by UID and deletes the ones gone from the feed; past classes stay as they were. */
  #apply(feed: CalendarEvent[], now: string): { verb: Verb; date: string }[] {
    const store = this.#stores.calendarEvent;
    const stored = new Map(
      store
        .overlapping(now, "9999-12-31T23:59")
        .filter((e) => e.kind === "class")
        .map((e) => [e.id, e]),
    );
    const lines: { verb: Verb; date: string }[] = [];
    // Past classes only fill an empty history, so the week view of a past week still shows them.
    for (const event of feed.filter((e) => e.end <= now && !store.get(e.id))) store.put(event);
    for (const event of feed.filter((e) => e.end > now)) {
      const old = stored.get(event.id);
      stored.delete(event.id);
      if (old && sameClass(old, event)) continue;
      lines.push({ verb: old ? "modifié" : "ajouté", date: dateOf(event.start) });
      store.put({ ...event, cancelled: old?.cancelled ?? false });
    }
    for (const gone of stored.values()) {
      lines.push({ verb: "annulé", date: dateOf(gone.start) });
      store.delete(gone.id);
    }
    return lines;
  }
}
