import {
  createEventInputSchema,
  deleteEventQuerySchema,
  isoWeekSchema,
  moveSessionInputSchema,
  profilePatchSchema,
  programSchema,
  updateEventInputSchema,
} from "@talaria/protocol";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import { InvalidInputError } from "../errors.ts";
import type { Services } from "../services/index.ts";

async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const json: unknown = await c.req.json().catch(() => {
    throw new InvalidInputError("La requête doit contenir du JSON.");
  });
  return schema.parse(json);
}

/** JSON routes of the web app; each validates its input and calls one service. */
export function planRoutes({ plan, changes, timetable }: Services): Hono {
  return new Hono()
    .get("/today", (c) => c.json(plan.today()))
    .get("/weeks/:week", (c) => c.json(plan.week(isoWeekSchema.parse(c.req.param("week")))))
    .post("/events", async (c) => c.json(plan.createEvent(await body(c, createEventInputSchema)), 201))
    .patch("/events/:id", async (c) =>
      c.json(plan.updateEvent(c.req.param("id"), await body(c, updateEventInputSchema))),
    )
    .delete("/events/:id", (c) =>
      c.json(plan.deleteEvent(c.req.param("id"), deleteEventQuerySchema.parse(c.req.query()))),
    )
    .post("/events/:id/cancel", (c) => c.json(plan.cancelClass(c.req.param("id"))))
    .get("/sessions/:id/slots", (c) => c.json(plan.proposeMoveSlots(c.req.param("id"))))
    .post("/sessions/:id/move", async (c) => {
      const { start } = await body(c, moveSessionInputSchema);
      return c.json(plan.moveSession(c.req.param("id"), start));
    })
    .get("/profile", (c) => c.json(plan.profile()))
    .patch("/profile", async (c) => c.json(plan.updateProfile(await body(c, profilePatchSchema))))
    .get("/program", (c) => c.json(plan.program()))
    .put("/program", async (c) => c.json(plan.updateProgram(await body(c, programSchema))))
    .post("/changes/:id/undo", (c) => {
      const entry = changes.undo(c.req.param("id"));
      return c.json({ id: entry.id, summary: entry.summary });
    })
    .get("/timetable", (c) => c.json(timetable.status()))
    .post("/timetable/refresh", async (c) => c.json(await timetable.refresh()));
}
