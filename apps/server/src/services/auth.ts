import { createHash, randomBytes } from "node:crypto";
import { InvalidLoginLinkError, TooManyAttemptsError } from "../errors.ts";
import type { Stores } from "../storage/stores.ts";
import type { Clock } from "../time.ts";

const LOGIN_LINK_MS = 15 * 60_000;
export const SESSION_SECONDS = 180 * 24 * 3600;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;

const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** One user: a one-time link from the server CLI opens a long session. */
export class AuthService {
  readonly #stores: Stores;
  readonly #clock: Clock;
  #failures: number[] = [];

  constructor(stores: Stores, clock: Clock) {
    this.#stores = stores;
    this.#clock = clock;
  }

  createLoginLink(publicUrl: string): string {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.#clock().getTime() + LOGIN_LINK_MS).toISOString();
    this.#stores.loginToken.put({ id: hash(token), expiresAt });
    return new URL(`/api/auth/login?token=${token}`, publicUrl).toString();
  }

  /** Consumes the link and returns a new session id. */
  login(token: string): string {
    const now = this.#clock();
    // shortcut: one global limit, not per IP (single user); a flood can delay her login by 15 min.
    this.#failures = this.#failures.filter((t) => now.getTime() - t < FAILURE_WINDOW_MS);
    if (this.#failures.length >= MAX_FAILURES) throw new TooManyAttemptsError();

    const link = this.#stores.loginToken.get(hash(token));
    if (!link || link.usedAt || link.expiresAt <= now.toISOString()) {
      this.#failures.push(now.getTime());
      throw new InvalidLoginLinkError();
    }
    this.#stores.loginToken.put({ ...link, usedAt: now.toISOString() });
    const sessionId = randomBytes(32).toString("base64url");
    const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
    this.#stores.authSession.put({ id: hash(sessionId), expiresAt });
    return sessionId;
  }

  isValidSession(sessionId: string): boolean {
    const session = this.#stores.authSession.get(hash(sessionId));
    return session !== undefined && session.expiresAt > this.#clock().toISOString();
  }
}
