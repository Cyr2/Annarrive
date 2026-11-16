import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";

const port = Number(process.env.PORT ?? 8787);
const app = createApp(process.env.WEB_DIST ? { webDist: process.env.WEB_DIST } : {});

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`Talaria écoute sur le port ${info.port}`);
});
