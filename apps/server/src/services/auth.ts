import { createHash, randomBytes } from "node:crypto";
import type { authenticationResponseSchema, registrationResponseSchema } from "@annarrive/protocol";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { z } from "zod";
import {
  InvalidInputError,
  InvalidLoginLinkError,
  NotFoundError,
  PasskeyRefusedError,
  TooManyAttemptsError,
  WrongPasswordError,
} from "../errors.ts";
import type { AuthSession, Passkey, Stores } from "../storage/stores.ts";
import type { Clock } from "../time.ts";
import { hashPassword, newPassword, verifyPassword } from "./password.ts";

const LOGIN_LINK_MS = 15 * 60_000;
export const SESSION_SECONDS = 180 * 24 * 3600;
const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
/** How long Face ID may take to answer, and so how long its challenge stays valid. */
const CHALLENGE_MS = 5 * 60_000;
/** Expiry bounds the pool already; the cap only stops a flood from many addresses growing it past a few MB. */
const MAX_CHALLENGES = 1000;
/** Checked against when the name is unknown, so a wrong name takes as long as a wrong password. */
const DECOY_HASH = hashPassword(randomBytes(16).toString("hex"));

export const hash = (secret: string) => createHash("sha256").update(secret).digest("hex");

type Challenge = { kind: "login" | "register"; userId: string | undefined; expiresAt: number };
export type AccountView = { id: string; hasPassword: boolean; passkeys: Passkey[] };

/**
 * A few accounts, made by the server CLI: a password opens a first session on a device, then a passkey (Face ID)
 * opens the next ones. A one-time link from the CLI stays as the admin's way in. Sessions last 180 days.
 */
export class AuthService {
  readonly #stores: Stores;
  readonly #clock: Clock;
  readonly #rpId: string;
  readonly #origin: string;
  /** Recent password attempts per client address (each one counted until it succeeds). */
  readonly #attempts = new Map<string, number[]>();
  // shortcut: challenges live in memory, so a restart during a Face ID prompt fails it once; fine for one process.
  readonly #challenges = new Map<string, Challenge>();

  constructor(stores: Stores, clock: Clock, publicUrl: string) {
    this.#stores = stores;
    this.#clock = clock;
    const url = new URL(publicUrl);
    this.#rpId = url.hostname;
    this.#origin = url.origin;
  }

  /** A link for `userId` lets that account add Face ID after it; without one, it only opens a session. */
  createLoginLink(publicUrl: string, userId?: string): string {
    if (userId !== undefined && !this.#stores.user.get(userId)) throw new NotFoundError(`Aucun compte « ${userId} ».`);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.#clock().getTime() + LOGIN_LINK_MS).toISOString();
    this.#stores.loginToken.put({ id: hash(token), expiresAt, userId });
    return new URL(`/api/auth/login?token=${token}`, publicUrl).toString();
  }

  /**
   * Consumes the link and returns a new session id, with the account it opens. No lockout: a 256-bit token
   * cannot be guessed, and the admin's way back must not be blocked by someone else's failures.
   */
  login(token: string): { sessionId: string; userId: string | undefined } {
    const now = this.#clock();
    const link = this.#stores.loginToken.get(hash(token));
    if (!link || link.usedAt || link.expiresAt <= now.toISOString()) throw new InvalidLoginLinkError();
    this.#stores.loginToken.put({ ...link, usedAt: now.toISOString() });
    return { sessionId: this.#openSession(link.userId), userId: link.userId };
  }

  /** `client` is the caller's address: 5 failures block that address for 15 minutes, not everyone. */
  async passwordLogin(username: string, password: string, client: string): Promise<string> {
    // Counted before the check, so parallel requests cannot all slip in under the limit.
    const attempt = this.#countAttempt(client);
    const stored = this.#stores.user.get(username)?.passwordHash;
    const ok = await verifyPassword(password, stored ?? (await DECOY_HASH));
    if (!stored || !ok) throw new WrongPasswordError();
    const attempts = this.#attempts.get(client) ?? [];
    const index = attempts.indexOf(attempt);
    if (index >= 0) attempts.splice(index, 1);
    return this.#openSession(username);
  }

  /** The session behind a cookie, while it lasts. */
  session(sessionId: string): AuthSession | undefined {
    const session = this.#stores.authSession.get(hash(sessionId));
    return session && session.expiresAt > this.#clock().toISOString() ? session : undefined;
  }

  /** « Se déconnecter »: this device's session ends; her other devices stay signed in. */
  logout(sessionId: string): void {
    this.#stores.authSession.delete(hash(sessionId));
  }

  /** Options for « Se connecter avec Face ID »: any passkey of this site, so nothing is typed first. */
  async passkeyLoginOptions() {
    const options = await generateAuthenticationOptions({
      rpID: this.#rpId,
      userVerification: "required",
      timeout: CHALLENGE_MS,
    });
    this.#keepChallenge(options.challenge, "login", undefined);
    return options;
  }

  async passkeyLogin(response: z.infer<typeof authenticationResponseSchema>): Promise<string> {
    const passkey = this.#stores.passkey.get(response.id);
    if (!passkey)
      throw new PasskeyRefusedError("Cette clé d'accès n'est plus reconnue : connecte-toi avec ton mot de passe.");
    let result: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      result = await verifyAuthenticationResponse({
        response,
        expectedChallenge: (challenge) => this.#takeChallenge(challenge, "login", undefined),
        expectedOrigin: this.#origin,
        expectedRPID: this.#rpId,
        credential: {
          id: passkey.id,
          publicKey: Buffer.from(passkey.publicKey, "base64url"),
          counter: passkey.counter,
          transports: passkey.transports,
        },
        requireUserVerification: true,
      });
    } catch {
      // The library throws on any mismatch (challenge, origin, signature, a counter that went back).
      throw new PasskeyRefusedError();
    }
    if (!result.verified) throw new PasskeyRefusedError();
    this.#stores.passkey.put({
      ...passkey,
      counter: result.authenticationInfo.newCounter,
      lastUsedAt: this.#clock().toISOString(),
    });
    return this.#openSession(passkey.userId);
  }

  /** Options to add this device's Face ID to the signed-in account; a passkey it already holds is excluded. */
  async registrationOptions(userId: string) {
    const options = await generateRegistrationOptions({
      rpName: "Annarrivé",
      rpID: this.#rpId,
      userName: userId,
      // Stable per account: a phone keeps one passkey per account, never a pile of them.
      userID: createHash("sha256").update(`annarrive:${userId}`).digest(),
      attestationType: "none",
      excludeCredentials: this.#passkeysOf(userId).map((p) => ({ id: p.id, transports: p.transports })),
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      timeout: CHALLENGE_MS,
    });
    this.#keepChallenge(options.challenge, "register", userId);
    return options;
  }

  async registerPasskey(userId: string, response: z.infer<typeof registrationResponseSchema>): Promise<void> {
    let result: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      result = await verifyRegistrationResponse({
        response,
        expectedChallenge: (challenge) => this.#takeChallenge(challenge, "register", userId),
        expectedOrigin: this.#origin,
        expectedRPID: this.#rpId,
        requireUserVerification: true,
      });
    } catch {
      throw new InvalidInputError("Ça n'a pas été enregistré : réessaie.");
    }
    if (!result.verified) throw new InvalidInputError("Ça n'a pas été enregistré : réessaie.");
    const { credential } = result.registrationInfo;
    // Never replace a stored passkey, whoever holds it: that would hand its id to another key.
    if (this.#stores.passkey.get(credential.id))
      throw new InvalidInputError("Cette clé d'accès est déjà enregistrée : connecte-toi avec elle.");
    this.#stores.passkey.put({
      id: credential.id,
      userId,
      publicKey: Buffer.from(credential.publicKey).toString("base64url"),
      counter: credential.counter,
      transports: credential.transports,
      createdAt: this.#clock().toISOString(),
    });
  }

  /** CLI: creates the account if needed and gives it a new password, returned once in clear; its sessions end. */
  async resetPassword(userId: string): Promise<string> {
    const password = newPassword();
    this.#stores.user.put({ id: userId, passwordHash: await hashPassword(password) });
    this.#endSessions(userId);
    return password;
  }

  /** CLI: every account with its passkeys. */
  accounts(): AccountView[] {
    return this.#stores.user.list().map((user) => ({
      id: user.id,
      hasPassword: user.passwordHash !== undefined,
      passkeys: this.#passkeysOf(user.id),
    }));
  }

  /**
   * CLI: removes a passkey (a lost phone) and ends every session of its account, since a session does not say
   * which device holds it: the other devices sign in again with Face ID.
   */
  revokePasskey(passkeyId: string): void {
    const passkey = this.#stores.passkey.get(passkeyId);
    if (!passkey) throw new NotFoundError(`Aucune clé d'accès « ${passkeyId} ».`);
    this.#stores.passkey.delete(passkeyId);
    this.#endSessions(passkey.userId);
  }

  /** Whether the account holds at least one passkey (on any of its devices). */
  hasPasskey(userId: string): boolean {
    return this.#passkeysOf(userId).length > 0;
  }

  #passkeysOf(userId: string): Passkey[] {
    return this.#stores.passkey.list().filter((p) => p.userId === userId);
  }

  /** Records a password attempt for `client`, or refuses it once 5 are pending or failed within 15 minutes. */
  #countAttempt(client: string): number {
    const now = this.#clock().getTime();
    // Old addresses go once there are many, so a spread of them cannot grow the map for ever.
    if (this.#attempts.size > 1000)
      for (const [key, times] of this.#attempts)
        if (times.every((t) => now - t >= FAILURE_WINDOW_MS)) this.#attempts.delete(key);
    const recent = (this.#attempts.get(client) ?? []).filter((t) => now - t < FAILURE_WINDOW_MS);
    if (recent.length >= MAX_FAILURES) throw new TooManyAttemptsError();
    recent.push(now);
    this.#attempts.set(client, recent);
    return now;
  }

  /** Ends every session of an account: after a new password or a revoked passkey, nothing old stays open. */
  #endSessions(userId: string): void {
    for (const session of this.#stores.authSession.list())
      if (session.userId === userId) this.#stores.authSession.delete(session.id);
  }

  #openSession(userId: string | undefined): string {
    const sessionId = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.#clock().getTime() + SESSION_SECONDS * 1000).toISOString();
    this.#stores.authSession.put({ id: hash(sessionId), expiresAt, userId });
    return sessionId;
  }

  #keepChallenge(challenge: string, kind: Challenge["kind"], userId: string | undefined): void {
    const now = this.#clock().getTime();
    for (const [key, kept] of this.#challenges) if (kept.expiresAt <= now) this.#challenges.delete(key);
    // Oldest first: a flood of options pushes out its own challenges, the rate limit does the rest.
    const oldest = this.#challenges.keys().next();
    if (this.#challenges.size >= MAX_CHALLENGES && !oldest.done) this.#challenges.delete(oldest.value);
    this.#challenges.set(challenge, { kind, userId, expiresAt: now + CHALLENGE_MS });
  }

  /** Single use: the challenge is gone whether it matched or not. */
  #takeChallenge(challenge: string, kind: Challenge["kind"], userId: string | undefined): boolean {
    const kept = this.#challenges.get(challenge);
    this.#challenges.delete(challenge);
    return kept?.kind === kind && kept.userId === userId && kept.expiresAt > this.#clock().getTime();
  }
}
