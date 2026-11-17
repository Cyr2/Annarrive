import { createHmac, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";

// A fresh secret and session on each run, handed to the seeded server through the environment it inherits.
const secret = randomBytes(32).toString("hex");
const session = randomBytes(32).toString("base64url");
// Hono's signed cookie: the value, a dot, then its HMAC-SHA256 in base64.
const signed = `${session}.${createHmac("sha256", secret).update(session).digest("base64")}`;
const port = 8790;
Object.assign(process.env, {
  SESSION_SECRET: secret,
  LIGHTHOUSE_SESSION: session,
  PORT: String(port),
  WEB_DIST: fileURLToPath(new URL("apps/web/dist", import.meta.url)),
});

const atLeast95 = ["error", { minScore: 0.95 }];

export default {
  ci: {
    collect: {
      startServerCommand: "pnpm --filter @annarrive/server lighthouse",
      startServerReadyPattern: "listen",
      url: [`http://localhost:${port}/`],
      numberOfRuns: 3,
      settings: {
        formFactor: "mobile",
        extraHeaders: JSON.stringify({ Cookie: `__Host-annarrive_session=${encodeURIComponent(signed)}` }),
      },
    },
    assert: {
      assertions: {
        "categories:performance": atLeast95,
        "categories:accessibility": atLeast95,
        "categories:best-practices": atLeast95,
        "categories:seo": atLeast95,
      },
    },
    upload: { target: "temporary-public-storage" },
  },
};
