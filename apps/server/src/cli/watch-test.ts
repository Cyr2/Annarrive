import { z } from "zod";
import { createBridgeClient } from "../garmin/bridge-client.ts";
import { runWatchTest } from "../services/watch-test.ts";
import { systemClock, toParisLocal } from "../time.ts";

// Only the owner's own bridge: BRIDGE_URL (Anna's account) is never read here.
const env = z.object({ DARIUS_BRIDGE_URL: z.url(), DARIUS_BRIDGE_SECRET: z.string().min(1) }).safeParse(process.env);
if (!env.success) {
  console.error("DARIUS_BRIDGE_URL et DARIUS_BRIDGE_SECRET sont requis (le bridge du compte Garmin de Darius).");
  process.exit(1);
}
try {
  const bridge = createBridgeClient({ baseUrl: env.data.DARIUS_BRIDGE_URL, secret: env.data.DARIUS_BRIDGE_SECRET });
  console.info((await runWatchTest(process.argv.slice(2), bridge, toParisLocal(systemClock()))).join("\n"));
} catch (error) {
  console.error(error instanceof z.ZodError ? z.prettifyError(error) : error instanceof Error ? error.message : error);
  process.exit(1);
}
