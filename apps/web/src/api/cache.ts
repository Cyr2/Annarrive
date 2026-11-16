import { z } from "zod";
import { todaySchema, weekSchema } from "./schemas.ts";

const KEY = "talaria.firstScreen";

const firstScreenSchema = z.object({ today: todaySchema, week: weekSchema });
export type FirstScreen = z.infer<typeof firstScreenSchema>;

/**
 * The last Aujourd'hui read from the server, painted at launch while the fresh one loads. Only a copy from the
 * same day counts: yesterday's run is not today's. Anything unreadable (old format, edited by hand) is ignored.
 */
export function readFirstScreen(date: string): FirstScreen | undefined {
  try {
    const parsed = firstScreenSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "null"));
    return parsed.success && parsed.data.today.date === date ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function saveFirstScreen(value: FirstScreen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the next launch simply waits for the network.
  }
}
