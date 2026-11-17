import { ApiError } from "../../api/errors.ts";

/** What unlocks a passkey on this device, as the person knows it. */
export function unlockName(userAgent: string): string {
  if (/iPhone/.test(userAgent)) return "Face ID";
  if (/iPad|Macintosh/.test(userAgent)) return "Touch ID";
  return "ton empreinte";
}

/**
 * Nothing to say: she closed the prompt (NotAllowedError), another request took its place (AbortError), or
 * this device already holds a passkey for the account (InvalidStateError, when adding one).
 */
const SILENT = new Set(["NotAllowedError", "AbortError", "InvalidStateError"]);

/** The message for a failed passkey step, or null when there is nothing to say. */
export function passkeyError(error: unknown, unlock: string): string | null {
  if (error instanceof ApiError) return error.message;
  const name = error instanceof Error || error instanceof DOMException ? error.name : "";
  if (SILENT.has(name)) return null;
  return `${unlock} n'a pas marché : réessaie, ou utilise ton mot de passe.`;
}
