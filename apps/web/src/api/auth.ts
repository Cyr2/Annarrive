import { creationOptionsSchema, requestOptionsSchema, sessionInfoSchema } from "@annarrive/protocol";
import type { z } from "zod";
import { ApiError } from "./errors.ts";
import { serverMessage } from "./http.ts";

const OFFLINE = "Pas de connexion au serveur : vérifie ton réseau, puis réessaie.";
const UNEXPECTED = "Ça n'a pas marché : recharge l'app, puis réessaie.";

/** Signing in happens before any session, so these calls skip the app's client and its 401 handling. */
async function post(path: string, body?: unknown, fetcher: typeof fetch = fetch): Promise<unknown> {
  const response = await fetcher(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError(0, OFFLINE);
  });
  if (!response.ok) {
    const message = await serverMessage(response);
    throw new ApiError(response.status, message ?? "Ça n'a pas marché : réessaie dans un instant.");
  }
  return response.status === 204 ? undefined : response.json().catch(() => undefined);
}

function parse<T>(json: unknown, schema: z.ZodType<T>): T {
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new ApiError(502, UNEXPECTED);
  return parsed.data;
}

// The WebAuthn helper loads only when a passkey is used, never with the first screen.
const webauthn = () => import("@simplewebauthn/browser");

export async function logInWithPassword(username: string, password: string, fetcher?: typeof fetch): Promise<void> {
  await post("/api/auth/password", { username, password }, fetcher);
}

/**
 * Face ID: the phone offers the passkeys it holds for this site, nothing is typed. `autofill` waits instead
 * for a passkey picked in the name field's suggestions (iOS's QuickType bar), where the browser supports it.
 */
export async function logInWithPasskey(autofill = false, fetcher?: typeof fetch): Promise<void> {
  const { startAuthentication } = await webauthn();
  const optionsJSON = parse(await post("/api/auth/passkey/options", undefined, fetcher), requestOptionsSchema);
  const response = await startAuthentication({ optionsJSON, useBrowserAutofill: autofill });
  await post("/api/auth/passkey", response, fetcher);
}

/** Adds this device's Face ID to the signed-in account. */
export async function registerPasskey(fetcher?: typeof fetch): Promise<void> {
  const { startRegistration } = await webauthn();
  const optionsJSON = parse(await post("/api/passkeys/options", undefined, fetcher), creationOptionsSchema);
  const response = await startRegistration({ optionsJSON });
  await post("/api/passkeys", response, fetcher);
}

/** Whether the account already holds a passkey; null when it cannot tell (network, reply), so nothing is offered. */
export async function hasPasskey(fetcher: typeof fetch = fetch): Promise<boolean | null> {
  const response = await fetcher("/api/session", { credentials: "same-origin" }).catch(() => null);
  const parsed = sessionInfoSchema.safeParse(await response?.json().catch(() => undefined));
  return parsed.success ? parsed.data.hasPasskey : null;
}

/** « Se déconnecter »: the server ends this device's session and drops its cookie. */
export async function logOut(fetcher?: typeof fetch): Promise<void> {
  await post("/api/auth/logout", undefined, fetcher);
}

/** A device that can hold a passkey behind Face ID, Touch ID or a fingerprint. */
export async function canUsePasskeys(): Promise<boolean> {
  if (typeof PublicKeyCredential === "undefined") return false;
  return PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().catch(() => false);
}

/** The name field can offer passkeys among its suggestions (Safari 16+, Chrome 108+). */
export async function canAutofillPasskeys(): Promise<boolean> {
  if (typeof PublicKeyCredential === "undefined" || !PublicKeyCredential.isConditionalMediationAvailable) return false;
  return PublicKeyCredential.isConditionalMediationAvailable().catch(() => false);
}
