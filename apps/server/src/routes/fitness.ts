import { feelInputSchema } from "@annarrive/protocol";
import { Hono } from "hono";
import type { Services } from "../services/index.ts";
import { body } from "./plan.ts";

/** Level proposals: the app shows the pending ones, one tap accepts or declines. Feel answers may raise one. */
export function fitnessRoutes({ fitness }: Services): Hono {
  return new Hono()
    .post("/activities/:id/feel", async (c) => {
      fitness.logFeel(c.req.param("id"), (await body(c, feelInputSchema)).feel);
      return c.body(null, 204);
    })
    .get("/proposals", (c) => c.json(fitness.pending()))
    .post("/proposals/:id/accept", (c) => c.json(fitness.accept(c.req.param("id"))))
    .post("/proposals/:id/decline", (c) => c.json(fitness.decline(c.req.param("id"))));
}
