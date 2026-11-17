import type { PlannedSession, PushSubscriptionInput } from "@annarrive/protocol";
import { z } from "zod";
import type { Stores } from "../storage/stores.ts";
import { dateOf, frenchClock, frenchMoment, frenchWeekday } from "../time.ts";

/** Sends one Web Push message; rejects with a `statusCode` when the push service refuses it. */
export type PushSender = (subscription: PushSubscriptionInput, payload: string) => Promise<unknown>;

/** What the service worker shows; `url` is the screen a tap opens. */
export type PushMessage = { title: string; body: string; url: string };

// The push service says the subscription is gone for good: Anna uninstalled or revoked it.
const goneSchema = z.object({ statusCode: z.union([z.literal(404), z.literal(410)]) });
const statusSchema = z.object({ statusCode: z.number() });

/** The three events of docs/specs/produit.md, nothing else. */
export class NotificationService {
  readonly #stores: Stores;
  readonly #send: PushSender | undefined;
  readonly publicKey: string | null;

  constructor(stores: Stores, push: { send: PushSender; publicKey: string } | undefined) {
    this.#stores = stores;
    this.#send = push?.send;
    this.publicKey = push?.publicKey ?? null;
  }

  subscribe(input: PushSubscriptionInput): void {
    this.#stores.pushSubscription.put({ id: input.endpoint, keys: input.keys });
  }

  unsubscribe(endpoint: string): void {
    this.#stores.pushSubscription.delete(endpoint);
  }

  weekReady(): Promise<void> {
    return this.#broadcast({
      title: "Ta semaine est prête",
      body: "Tes courses sont placées, jette un œil.",
      url: "/semaine",
    });
  }

  runMoved(before: PlannedSession, after: PlannedSession): Promise<void> {
    const sameDay = dateOf(before.start) === dateOf(after.start);
    const day = frenchWeekday(dateOf(before.start));
    // A move here always comes from a class that changed: say so, so it never looks like a whim.
    const body = sameDay
      ? `Un cours a bougé ${day} : ta course passe à ${frenchClock(after.start)}.`
      : `Un cours a bougé : ta course de ${day} passe à ${frenchMoment(after.start)}.`;
    return this.#broadcast({
      title: "Course déplacée",
      body,
      url: "/",
    });
  }

  runSynced(): Promise<void> {
    return this.#broadcast({
      title: "Course enregistrée",
      body: "Comment ça s'est passé ? Laisse une note à Reggie.",
      url: "/",
    });
  }

  /** Never throws: a lost notification must not stop the job that triggered it. */
  async #broadcast(message: PushMessage): Promise<void> {
    const send = this.#send;
    if (!send) return;
    const payload = JSON.stringify(message);
    for (const sub of this.#stores.pushSubscription.list()) {
      try {
        await send({ endpoint: sub.id, keys: sub.keys }, payload);
      } catch (error) {
        if (goneSchema.safeParse(error).success) this.#stores.pushSubscription.delete(sub.id);
        // The endpoint is a capability URL: it stays out of the logs.
        else
          console.error(
            `Notification non envoyée : statut ${statusSchema.safeParse(error).data?.statusCode ?? "inconnu"}`,
          );
      }
    }
  }
}
