import { ApiError } from "../../api/errors.ts";
import type { IconName } from "../../ui/Icon.tsx";

/** How a passkey is called on this device, so an Android phone is never asked about Face ID. */
export interface PasskeyWording {
  /** As the person knows it, after a verb: « Se connecter avec Face ID », « avec ton empreinte ». */
  name: string;
  /** The Réglages row that turns it on. */
  enable: string;
  /** The same row once it is on. */
  enabled: string;
  icon: Extract<IconName, "faceId" | "fingerprint">;
}

const FACE_ID: PasskeyWording = {
  name: "Face ID",
  enable: "Activer Face ID",
  enabled: "Face ID activé",
  icon: "faceId",
};
const TOUCH_ID: PasskeyWording = {
  name: "Touch ID",
  enable: "Activer Touch ID",
  enabled: "Touch ID activé",
  icon: "fingerprint",
};
// Android, Windows, Linux: a fingerprint or the screen lock, whichever the device has.
const ELSEWHERE: PasskeyWording = {
  name: "ton empreinte",
  enable: "Activer l'empreinte",
  enabled: "Empreinte activée",
  icon: "fingerprint",
};

/** An iPad asks for its desktop site as a Mac: only its touch screen tells them apart. */
export function passkeyWording(userAgent: string, maxTouchPoints = 0): PasskeyWording {
  if (/iPhone|iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return FACE_ID;
  if (/Macintosh/.test(userAgent)) return TOUCH_ID;
  return ELSEWHERE;
}

/** The wording for the device this page runs on. */
export const thisDevicePasskey = () => passkeyWording(navigator.userAgent, navigator.maxTouchPoints);

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
