import { type PushKey, pushSubscriptionInputSchema, pushUnsubscribeInputSchema } from "@annarrive/protocol";
import { Hono } from "hono";
import type { Services } from "../services/index.ts";
import { body } from "./plan.ts";

/** Web Push: the app asks for the key, then registers or drops this iPhone's subscription. */
export function pushRoutes({ notifications }: Services): Hono {
  return new Hono()
    .get("/push/key", (c) => c.json<PushKey>({ publicKey: notifications.publicKey }))
    .post("/push/subscriptions", async (c) => {
      notifications.subscribe(await body(c, pushSubscriptionInputSchema));
      return c.body(null, 204);
    })
    .delete("/push/subscriptions", async (c) => {
      notifications.unsubscribe((await body(c, pushUnsubscribeInputSchema)).endpoint);
      return c.body(null, 204);
    });
}
