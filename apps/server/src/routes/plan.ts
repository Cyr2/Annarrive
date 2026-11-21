import {
  changeSessionInputSchema,
  createEventInputSchema,
  deleteEventQuerySchema,
  dismissReviewInputSchema,
  feasibilityInputSchema,
  isoWeekSchema,
  moveSessionInputSchema,
  profilePatchSchema,
  programInputSchema,
  timetableUrlInputSchema,
  unavailableSchema,
  updateEventInputSchema,
  type WatchInfo,
} from "@annarrive/protocol";
import { type Context, Hono } from "hono";
import type { z } from "zod";
import { GarminNotConfiguredError, InvalidInputError } from "../errors.ts";
import type { Services } from "../services/index.ts";
import { addDays, isoWeekOf } from "../time.ts";

export async function body<T extends z.ZodType>(c: Context, schema: T): Promise<z.infer<T>> {
  const json: unknown = await c.req.json().catch(() => {
    throw new InvalidInputError("La requête doit contenir du JSON.");
  });
  return schema.parse(json);
}

/** JSON routes of the web app; each validates its input and calls one service. */
export function planRoutes({ plan, changes, timetable, garmin, fitness, review }: Services): Hono {
  const day = () => ({ ...plan.today(), ...review.today() });
  return (
    new Hono()
      .get("/today", (c) => c.json(day()))
      // Everything Aujourd'hui reads at launch in one request, keyed by the route that serves each part alone.
      .get("/first-screen", (c) => {
        const today = day();
        const weeks = [isoWeekOf(today.date), isoWeekOf(addDays(today.date, 7))];
        return c.json({
          "/today": today,
          "/program": plan.program(),
          "/proposals": fitness.pending(),
          "/timetable": timetable.status(),
          ...Object.fromEntries(weeks.map((week) => [`/weeks/${week}`, plan.week(week)])),
        });
      })
      .get("/weeks/:week", (c) => c.json(plan.week(isoWeekSchema.parse(c.req.param("week")))))
      .post("/events", async (c) => c.json(plan.createEvent(await body(c, createEventInputSchema)), 201))
      .patch("/events/:id", async (c) =>
        c.json(plan.updateEvent(c.req.param("id"), await body(c, updateEventInputSchema))),
      )
      .delete("/events/:id", (c) =>
        c.json(plan.deleteEvent(c.req.param("id"), deleteEventQuerySchema.parse(c.req.query()))),
      )
      .post("/events/:id/cancel", (c) => c.json(plan.cancelClass(c.req.param("id"))))
      .delete("/events/:id/cancel", (c) => c.json(plan.restoreClass(c.req.param("id"))))
      .get("/sessions/:id/slots", (c) => c.json(plan.proposeMoveSlots(c.req.param("id"))))
      .post("/sessions/:id/move", async (c) => {
        const { start } = await body(c, moveSessionInputSchema);
        return c.json(plan.moveSession(c.req.param("id"), start));
      })
      .post("/sessions/:id/done", (c) => c.json(plan.confirmDone(c.req.param("id"))))
      .post("/sessions/:id/skip", (c) => c.json(plan.skipSession(c.req.param("id"))))
      .get("/sessions/:id/options", (c) => c.json(plan.changeOptions(c.req.param("id"))))
      .post("/sessions/:id/change", async (c) => {
        const { option } = await body(c, changeSessionInputSchema);
        return c.json(plan.changeSession(c.req.param("id"), option));
      })
      .post("/unavailable", async (c) => c.json(plan.reportUnavailable(await body(c, unavailableSchema))))
      .post("/unavailable/preview", async (c) => c.json(plan.previewUnavailable(await body(c, unavailableSchema))))
      .post("/feel-better", (c) => c.json(plan.feelBetter()))
      .post("/review/dismiss", async (c) => {
        review.dismiss((await body(c, dismissReviewInputSchema)).week);
        return c.body(null, 204);
      })
      .post("/race/keep-fit", (c) => c.json(plan.keepFit()))
      .get("/profile", (c) => c.json(plan.profile()))
      .patch("/profile", async (c) => c.json(plan.updateProfile(await body(c, profilePatchSchema))))
      .get("/onboarding", (c) => c.json(plan.onboarding()))
      .post("/feasibility", async (c) => c.json(plan.feasibility(await body(c, feasibilityInputSchema))))
      .get("/program", (c) => c.json(plan.programView()))
      .put("/program", async (c) => c.json(plan.updateProgram(await body(c, programInputSchema))))
      .post("/changes/:id/undo", (c) => {
        const entry = changes.undo(c.req.param("id"));
        return c.json({ id: entry.id, summary: entry.summary });
      })
      .get("/timetable", (c) => c.json(timetable.status()))
      .post("/timetable/refresh", async (c) => c.json(await timetable.refresh()))
      .put("/timetable/url", async (c) => c.json(await timetable.setUrl((await body(c, timetableUrlInputSchema)).url)))
      .get("/watch", (c) =>
        c.json<WatchInfo>({ configured: garmin !== null, lastSyncAt: garmin?.lastSyncAt() ?? null }),
      )
      // "Pas envoyée, réessayer": the app reloads the day afterwards to read the new status.
      .post("/watch/sync", async (c) => {
        if (!garmin) {
          // The technical cause stays in the logs: Anna reads only that the watch is not linked yet.
          console.error("Montre non reliée : BRIDGE_URL et BRIDGE_SECRET manquants");
          throw new GarminNotConfiguredError();
        }
        await garmin.syncWatch();
        return c.body(null, 204);
      })
  );
}
