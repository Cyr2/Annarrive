import { Hono } from "hono";
import type { Services } from "../services/index.ts";

/** Level proposals: the app shows the pending ones, one tap accepts or declines. */
export function fitnessRoutes({ fitness }: Services): Hono {
  return new Hono()
    .get("/proposals", (c) => c.json(fitness.pending()))
    .post("/proposals/:id/accept", (c) => c.json(fitness.accept(c.req.param("id"))))
    .post("/proposals/:id/decline", (c) => c.json(fitness.decline(c.req.param("id"))));
}
