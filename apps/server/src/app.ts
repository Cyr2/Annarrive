import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  authenticationResponseSchema,
  type Health,
  passwordLoginSchema,
  registrationResponseSchema,
} from "@annarrive/protocol";
import { getConnInfo } from "@hono/node-server/conninfo";
import { serveStatic } from "@hono/node-server/serve-static";
import { type Context, Hono, type Next } from "hono";
import { bodyLimit } from "hono/body-limit";
import { compress } from "hono/compress";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { secureHeaders } from "hono/secure-headers";
import { ZodError, z } from "zod";
import { AppError, ReadOnlyError, UnauthorizedError } from "./errors.ts";
import { chatRoutes } from "./routes/chat.ts";
import { fitnessRoutes } from "./routes/fitness.ts";
import { planRoutes } from "./routes/plan.ts";
import { pushRoutes } from "./routes/push.ts";
import { SESSION_SECONDS } from "./services/auth.ts";
import type { Services } from "./services/index.ts";

z.config(z.locales.fr());

/** The app's built text font (index.html preloads it), so the login pages draw in it too; the system font without a build. */
export function fontFace(webDist: string | undefined): string {
  if (!webDist) return "";
  let html: string;
  try {
    html = readFileSync(join(webDist, "index.html"), "utf8");
  } catch {
    return "";
  }
  const href = /href="(\/assets\/outfit-[\w-]+\.woff2)"/.exec(html)?.[1];
  return href
    ? `@font-face{font-family:Outfit;font-weight:400 700;font-display:swap;src:url(${href}) format("woff2")}`
    : "";
}

export const VERSION = "0.1.0";
// Sent as `__Host-annarrive_session`: https only, this host only, so a sibling subdomain cannot plant one.
const SESSION_COOKIE = "annarrive_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
/** Largest JSON body the API reads: a chat message is at most 2000 characters. */
const MAX_BODY_BYTES = 64 * 1024;

/** CSP hashes of the built page's inline scripts (service worker registration), so only they run. */
export function inlineScriptHashes(webDist: string | undefined): string[] {
  if (!webDist) return [];
  let html: string;
  try {
    html = readFileSync(join(webDist, "index.html"), "utf8");
  } catch {
    return [];
  }
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    ([, body]) =>
      `'sha256-${createHash("sha256")
        .update(body ?? "")
        .digest("base64")}'`,
  );
}

/** The PWA loads nothing from another origin; inline styles cover the login page and React's style props. */
const securityHeaders = (scriptHashes: string[]) =>
  secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", ...scriptHashes],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      fontSrc: ["'self'"],
      connectSrc: ["'self'"],
      // blob: for glisse's rim encoder, a worker built from its own script (patches/glisse@0.6.0.patch).
      workerSrc: ["'self'", "blob:"],
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
    if (foreign) throw new AppError(403, "Requête refusée : elle doit venir de l'app Annarrivé.");
  }
  await next();
}

/**
 * The client's address. Behind Coolify's Traefik the right-most X-Forwarded-For entry is the one Traefik saw,
 * the others are whatever the client sent; without a proxy, the socket's.
 */
export function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",").at(-1)?.trim();
  if (forwarded) return forwarded;
  try {
    return getConnInfo(c).remote.address ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * A fixed window per route. Signed-in routes keep one counter (one user: it bounds the cost of a stolen session
 * or a stuck client); the login routes pass `keyOf: clientIp`, so one address cannot lock everyone out.
 */
export function rateLimit(
  max: number,
  windowMs: number,
  now: () => number = Date.now,
  keyOf: (c: Context) => string = () => "",
) {
  const windows = new Map<string, { start: number; count: number }>();
  return async (c: Context, next: Next): Promise<void> => {
    const t = now();
    // Expired windows go once there are many, so a spread of addresses cannot grow the map for ever.
    if (windows.size > 1000) for (const [key, w] of windows) if (t - w.start >= windowMs) windows.delete(key);
    const key = keyOf(c);
    let w = windows.get(key);
    if (!w || t - w.start >= windowMs) {
      w = { start: t, count: 0 };
      windows.set(key, w);
    }
    w.count += 1;
    if (w.count > max) throw new AppError(429, "Trop de demandes d'un coup : attends une minute, puis réessaie.");
    await next();
  };
}

// base64url only, so the token can sit in the page's HTML as is.
const loginTokenSchema = z.string().regex(/^[\w-]{1,200}$/, "Lien de connexion incomplet");

/**
 * The login page's look: the app's « Ciel du matin » tokens (apps/web/src/styles/tokens.css), copied by value
 * because this page is served before the app and loads nothing else. The logo keeps its slot, as in the app.
 */
const LOGIN_CSS = [
  "*{box-sizing:border-box}",
  "html{background:#f7f9fb;color:#23303d;font:17px/1.35 Outfit,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}",
  // The app's calm sky: a soft apricot wash fading to warm near-white, still (no script, no animation on a page seen for a second).
  "body{margin:0;min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:24px;padding:max(24px,env(safe-area-inset-top)) 16px max(24px,env(safe-area-inset-bottom));background:radial-gradient(70% 30% at 15% 0%,rgb(255 218 196/.26),rgb(255 218 196/0)),linear-gradient(180deg,#fdede3 0%,#fdf1ea 18%,#fbf6f2 40%,#f9f6f3 100%) fixed}",
  "header{display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center;max-width:400px}",
  ".logo{width:80px;height:80px;margin-bottom:8px;display:block}",
  "h1{margin:0;font-size:28px;line-height:34px;font-weight:700;letter-spacing:-.022em}",
  "p{margin:0;color:#434e5a}",
  "main{width:100%;max-width:400px;display:flex;flex-direction:column;gap:12px;text-align:center}",
  "form{width:100%}",
  "button,.quiet{display:flex;align-items:center;justify-content:center;width:100%;min-height:50px;border:0;border-radius:25px;font:600 17px Outfit,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;text-decoration:none;cursor:pointer;-webkit-tap-highlight-color:transparent}",
  "button{background:#0967d6;color:#fff;box-shadow:inset 0 1px 0 rgb(255 255 255/.35),0 8px 22px rgb(9 103 214/.35)}",
  "button:active,.quiet:active{transform:scale(.97)}",
  ".quiet{background:rgb(255 255 255/.5);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);color:#0967d6;box-shadow:inset 0 0 0 .5px rgb(255 255 255/.75),inset 0 1px 0 rgb(255 255 255/.95),0 6px 20px rgb(90 40 10/.1)}",
  "button:focus-visible,.quiet:focus-visible{outline:2px solid #0967d6;outline-offset:3px}",
  ".notice{color:#875a0a;background:#fcf0d9;border-radius:16px;padding:12px 16px;font-size:15px;text-align:left}",
  "small{display:block;color:#434e5a;font-size:13px;line-height:18px}",
  "@media (prefers-reduced-motion:reduce){button:active,.quiet:active{transform:none}}",
].join("");

/** Server pages of the login: the app's sky, the logo's slot, a title and one sentence, then what to do. */
const loginPage = (font: string, title: string, lead: string, actions: string) =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><meta name="referrer" content="no-referrer"><meta name="theme-color" content="#FDEDE3"><meta name="color-scheme" content="light"><title>Connexion à Annarrivé</title><style>${font}${LOGIN_CSS}</style></head><body><header><img class="logo" src="/logo.svg" alt="Annarrivé" width="80" height="80"><h1>${title}</h1>${lead}</header><main>${actions}</main></body></html>`;

/** A login that failed: what happened, and the way out. */
const loginError = (font: string, message: string) =>
  loginPage(
    font,
    "Connexion impossible",
    `<p class="notice" role="alert">${message}</p>`,
    `<p>Un lien sert une seule fois et expire au bout de 15 minutes. Demande un nouveau lien, puis ouvre-le directement.</p><a class="quiet" href="/">Ouvrir Annarrivé</a>`,
  );

export type AppOptions = { services: Services; sessionSecret: string; webDist?: string | undefined };

/** The API, plus the built PWA when `webDist` is given (one container serves both). */
export function createApp({ services, sessionSecret, webDist }: AppOptions): Hono {
  const app = new Hono();
  app.use(securityHeaders(inlineScriptHashes(webDist)));
  const font = fontFace(webDist);

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
    const parsed = loginTokenSchema.safeParse(c.req.query("token"));
    c.header("Cache-Control", "no-store");
    if (!parsed.success)
      return c.html(loginError(font, "Ce lien de connexion est incomplet : copie-le en entier."), 400);
    return c.html(
      loginPage(
        font,
        "Bienvenue sur Annarrivé",
        "<p>Ce lien ouvre Annarrivé sur ce téléphone.</p>",
        `<form method="post" action="/api/auth/login"><input type="hidden" name="token" value="${parsed.data}"><button type="submit">Se connecter</button></form><small>Tu restes connectée ensuite.</small>`,
      ),
    );
  });

  const startSession = (c: Context, sessionId: string) =>
    setSignedCookie(c, SESSION_COOKIE, sessionId, sessionSecret, {
      prefix: "host",
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: SESSION_SECONDS,
    });
  const currentSession = async (c: Context) => {
    const sessionId = await getSignedCookie(c, sessionSecret, SESSION_COOKIE, "host");
    return sessionId ? services.auth.session(sessionId) : undefined;
  };
  const jsonBodyLimit = bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "Requête trop grosse : raccourcis ton message." }, 413),
  });

  app.post("/api/auth/login", async (c) => {
    let opened: ReturnType<Services["auth"]["login"]>;
    try {
      // Browsers flag a form posted from another site; this one must come from the page above.
      const site = c.req.header("sec-fetch-site");
      if (site && site !== "same-origin") throw new AppError(403, "Ouvre ton lien de connexion directement.");
      opened = services.auth.login(loginTokenSchema.parse((await c.req.parseBody()).token));
    } catch (error) {
      if (error instanceof AppError) return c.html(loginError(font, error.message), error.status);
      throw error;
    }
    await startSession(c, opened.sessionId);
    // A link made for an account offers Face ID next (the app's /face-id screen).
    return c.redirect(opened.userId ? "/face-id" : "/");
  });

  // Signing in: no session yet, so these come before the session check, each with its own guards, counted per
  // client address. Each password costs a scrypt (32 MiB, a thread of the pool): 10 a minute per client.
  app.post("/api/auth/password", sameOrigin, rateLimit(10, 60_000, Date.now, clientIp), jsonBodyLimit, async (c) => {
    const { username, password } = passwordLoginSchema.parse(await c.req.json());
    await startSession(c, await services.auth.passwordLogin(username, password, clientIp(c)));
    return c.body(null, 204);
  });
  app.post("/api/auth/passkey/options", sameOrigin, rateLimit(30, 60_000, Date.now, clientIp), async (c) =>
    c.json(await services.auth.passkeyLoginOptions()),
  );
  app.post("/api/auth/passkey", sameOrigin, jsonBodyLimit, async (c) => {
    const response = authenticationResponseSchema.parse(await c.req.json());
    await startSession(c, await services.auth.passkeyLogin(response));
    return c.body(null, 204);
  });

  app.use("/api/*", async (c, next) => {
    if (!(await currentSession(c))) throw new UnauthorizedError();
    await next();
  });
  app.use("/api/*", sameOrigin);
  app.use("/api/*", jsonBodyLimit);

  /** The signed-in account; a session opened by a link without a name has none, so it cannot add Face ID. */
  const accountOf = async (c: Context) => {
    const userId = (await currentSession(c))?.userId;
    if (!userId) throw new ReadOnlyError("Connecte-toi avec ton identifiant et ton mot de passe pour activer Face ID.");
    return userId;
  };
  app.post("/api/passkeys/options", rateLimit(30, 60_000), async (c) =>
    c.json(await services.auth.registrationOptions(await accountOf(c))),
  );
  app.post("/api/passkeys", async (c) => {
    const response = registrationResponseSchema.parse(await c.req.json());
    await services.auth.registerPasskey(await accountOf(c), response);
    return c.body(null, 204);
  });
  // Each message runs Reggie (paid model calls); each refresh downloads the ICS.
  app.post("/api/chat", rateLimit(30, 10 * 60_000));
  app.on(["POST", "PUT"], ["/api/timetable/refresh", "/api/timetable/url"], rateLimit(10, 60_000));
  app.route("/api", planRoutes(services));
  app.route("/api", pushRoutes(services));
  app.route("/api", chatRoutes(services));
  app.route("/api", fitnessRoutes(services));
  app.all("/api/*", (c) => c.json({ error: "Route inconnue" }, 404));

  if (webDist) {
    // Only the PWA's files: compressing the API would hold back Reggie's stream.
    app.use("/*", compress());
    // Hashed names change with their content, so a phone never asks for them twice (the HTML fallback excepted).
    app.use("/assets/*", async (c, next) => {
      await next();
      if (c.res.ok && !c.res.headers.get("content-type")?.startsWith("text/html"))
        c.header("Cache-Control", "public, max-age=31536000, immutable");
    });
    app.use("/*", serveStatic({ root: webDist }));
    // Client-side routes all land on the app shell.
    app.get("/*", async (c) => c.html(await readFile(join(webDist, "index.html"), "utf8")));
  }

  return app;
}
