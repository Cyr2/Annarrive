import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import type { Health } from "@talaria/protocol";
import { type Context, Hono, type Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { ZodError, z } from "zod";
import { AppError, UnauthorizedError } from "./errors.ts";
import { chatRoutes } from "./routes/chat.ts";
import { fitnessRoutes } from "./routes/fitness.ts";
import { planRoutes } from "./routes/plan.ts";
import { pushRoutes } from "./routes/push.ts";
import { SESSION_SECONDS } from "./services/auth.ts";
import type { Services } from "./services/index.ts";

z.config(z.locales.fr());

export const VERSION = "0.1.0";
// Sent as `__Host-talaria_session`: https only, this host only, so a sibling subdomain cannot plant one.
const SESSION_COOKIE = "talaria_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Largest JSON body the API reads: a chat message is at most 2000 characters. */
const MAX_BODY_BYTES = 64 * 1024;

/** The PWA loads nothing from another origin; inline styles cover the login page and React's style props. */
const securityHeaders = secureHeaders({
  contentSecurityPolicy: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "blob:"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    objectSrc: ["'none'"],
    baseUri: ["'none'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
  },
  strictTransportSecurity: "max-age=63072000; includeSubDomains",
  xFrameOptions: "DENY",
  // The login link carries its token in the URL.
  referrerPolicy: "no-referrer",
  permissionsPolicy: { camera: [], microphone: [], geolocation: [], payment: [], usb: [] },
});

/**
 * CSRF: a state-changing call must come from the app's own pages. Browsers send `Sec-Fetch-Site` and `Origin`;
 * a client that sends neither is not a browser, so it cannot ride Anna's cookie.
 */
export async function sameOrigin(c: Context, next: Next): Promise<void> {
  if (!SAFE_METHODS.has(c.req.method)) {
    const site = c.req.header("sec-fetch-site");
    const origin = c.req.header("origin");
    // Sec-Fetch-Site cannot be forged by a page; older browsers only send Origin (the dev proxy rewrites Host).
    const foreign = site
      ? site !== "same-origin"
      : origin !== undefined && URL.parse(origin)?.host !== c.req.header("host");
    if (foreign) throw new AppError(403, "Requête refusée : elle doit venir de l'app Talaria.");
  }
  await next();
}

/** A fixed window per route: one user, so one counter; it bounds the cost of a stolen session or a stuck client. */
export function rateLimit(max: number, windowMs: number, now: () => number = Date.now) {
  let windowStart = 0;
  let count = 0;
  return async (_c: Context, next: Next): Promise<void> => {
    const t = now();
    if (t - windowStart >= windowMs) {
      windowStart = t;
      count = 0;
    }
    count += 1;
    if (count > max) throw new AppError(429, "Trop de demandes d'un coup : attends une minute, puis réessaie.");
    await next();
  };
}

// base64url only, so the token can sit in the page's HTML as is.
const loginTokenSchema = z.string().regex(/^[\w-]{1,200}$/, "Lien de connexion incomplet");

const loginPage = (content: string) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Connexion à Talaria</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;font:17px system-ui,-apple-system,sans-serif;text-align:center}h1{font-size:28px}button{font:600 17px system-ui,-apple-system,sans-serif;min-height:44px;padding:0 24px;border:0;border-radius:12px;background:#0a7cff;color:#fff}</style></head><body><main><h1>Talaria</h1>${content}</main></body></html>`;

export type AppOptions = { services: Services; sessionSecret: string; webDist?: string | undefined };

/** The API, plus the built PWA when `webDist` is given (one container serves both). */
export function createApp({ services, sessionSecret, webDist }: AppOptions): Hono {
  const app = new Hono();
  app.use(securityHeaders);

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

  // Message apps fetch links to draw a preview: opening the link only shows a button, the POST logs in.
  app.get("/api/auth/login", (c) => {
    const token = loginTokenSchema.parse(c.req.query("token"));
    c.header("Cache-Control", "no-store");
    return c.html(
      loginPage(
        `<form method="post" action="/api/auth/login"><input type="hidden" name="token" value="${token}"><button type="submit">Se connecter</button></form>`,
      ),
    );
  });

  app.post("/api/auth/login", async (c) => {
    let sessionId: string;
    try {
      // Browsers flag a form posted from another site; this one must come from the page above.
      const site = c.req.header("sec-fetch-site");
      if (site && site !== "same-origin") throw new AppError(403, "Ouvre ton lien de connexion directement.");
      sessionId = services.auth.login(loginTokenSchema.parse((await c.req.parseBody()).token));
    } catch (error) {
      if (error instanceof AppError) return c.html(loginPage(`<p>${error.message}</p>`), error.status);
      throw error;
    }
    await setSignedCookie(c, SESSION_COOKIE, sessionId, sessionSecret, {
      prefix: "host",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
    return c.redirect("/");
  });

  app.use("/api/*", async (c, next) => {
    const sessionId = await getSignedCookie(c, sessionSecret, SESSION_COOKIE, "host");
    if (!sessionId || !services.auth.isValidSession(sessionId)) throw new UnauthorizedError();
    await next();
  });
  app.use("/api/*", sameOrigin);
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: MAX_BODY_BYTES,
      onError: (c) => c.json({ error: "Requête trop grosse : raccourcis ton message." }, 413),
    }),
  );
  // Each message runs Reggie (paid model calls); each refresh downloads the ICS.
  app.post("/api/chat", rateLimit(30, 10 * 60_000));
  app.on(["POST", "PUT"], ["/api/timetable/refresh", "/api/timetable/url"], rateLimit(10, 60_000));
  app.route("/api", planRoutes(services));
  app.route("/api", pushRoutes(services));
  app.route("/api", chatRoutes(services));
  app.route("/api", fitnessRoutes(services));
  app.all("/api/*", (c) => c.json({ error: "Route inconnue" }, 404));

  if (webDist) {
    app.use("/*", serveStatic({ root: webDist }));
    // Client-side routes all land on the app shell.
    app.get("/*", async (c) => c.html(await readFile(join(webDist, "index.html"), "utf8")));
  }

  return app;
}
