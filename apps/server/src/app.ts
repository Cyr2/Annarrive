import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Health } from "@talaria/protocol";
import { Hono } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { ZodError, z } from "zod";
import { AppError, UnauthorizedError } from "./errors.ts";
import { planRoutes } from "./routes/plan.ts";
import { SESSION_SECONDS } from "./services/auth.ts";
import type { Services } from "./services/index.ts";

z.config(z.locales.fr());

export const VERSION = "0.1.0";
const SESSION_COOKIE = "talaria_session";

export type AppOptions = { services: Services; sessionSecret: string; webDist?: string | undefined };

/** The API, plus the built PWA when `webDist` is given (one container serves both). */
export function createApp({ services, sessionSecret, webDist }: AppOptions): Hono {
  const app = new Hono();

  app.onError((error, c) => {
    if (error instanceof AppError) return c.json({ error: error.message }, error.status);
    if (error instanceof ZodError) {
      const issue = error.issues[0];
      return c.json({ error: `Donnée invalide (${issue?.path.join(".") || "requête"}) : ${issue?.message}` }, 400);
    }
    console.error(`Erreur inattendue : ${error.name}`);
    return c.json({ error: "Erreur du serveur : réessaie dans un instant." }, 500);
  });

  app.get("/api/health", (c) => c.json<Health>({ status: "ok", version: VERSION }));

  app.get("/api/auth/login", async (c) => {
    const token = z.string().min(1).max(200).parse(c.req.query("token"));
    const sessionId = services.auth.login(token);
    await setSignedCookie(c, SESSION_COOKIE, sessionId, sessionSecret, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return c.redirect("/");
  });

  app.use("/api/*", async (c, next) => {
    const sessionId = await getSignedCookie(c, sessionSecret, SESSION_COOKIE);
    if (!sessionId || !services.auth.isValidSession(sessionId)) throw new UnauthorizedError();
    await next();
  });
  app.route("/api", planRoutes(services));
  app.all("/api/*", (c) => c.json({ error: "Route inconnue" }, 404));

  if (webDist) {
    app.use("/*", serveStatic({ root: webDist }));
    // Client-side routes all land on the app shell.
    app.get("/*", async (c) => c.html(await readFile(join(webDist, "index.html"), "utf8")));
  }

  return app;
}
