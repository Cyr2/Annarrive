import { chatHistoryQuerySchema, chatRequestSchema } from "@annarrive/protocol";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { InvalidInputError } from "../errors.ts";
import type { Services } from "../services/index.ts";

/** Reggie's conversation: one day of history at a time, and one streamed reply per message (SSE, event name = `type`). */
export function chatRoutes({ chat }: Services): Hono {
  return new Hono()
    .get("/chat", (c) => c.json(chat.history(chatHistoryQuerySchema.parse(c.req.query()).day)))
    .post("/chat", async (c) => {
      const json: unknown = await c.req.json().catch(() => {
        throw new InvalidInputError("La requête doit contenir du JSON.");
      });
      const request = chatRequestSchema.parse(json);
      return streamSSE(c, async (stream) => {
        for await (const event of chat.send(request)) {
          await stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
        }
      });
    });
}
