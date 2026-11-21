import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors.ts";
import { passkeyError, passkeyWording } from "./unlock.ts";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)";
const PIXEL = "Mozilla/5.0 (Linux; Android 16; Pixel 9)";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/150.0";

describe("passkeyWording", () => {
  it("says Face ID on an iPhone and on an iPad that passes for a Mac", () => {
    expect(passkeyWording(IPHONE)).toMatchObject({
      enable: "Activer Face ID",
      enabled: "Face ID activé",
      icon: "faceId",
    });
    expect(passkeyWording(MAC, 5).name).toBe("Face ID");
  });

  it("says Touch ID on a Mac", () => {
    expect(passkeyWording(MAC)).toMatchObject({ name: "Touch ID", icon: "fingerprint" });
  });

  it("never mentions Face ID or Touch ID on Android or Windows", () => {
    for (const userAgent of [PIXEL, WINDOWS]) {
      const wording = passkeyWording(userAgent);
      expect(Object.values(wording).join(" ")).not.toMatch(/Face ID|Touch ID/);
      expect(wording).toMatchObject({ name: "ton empreinte", enabled: "Empreinte activée", icon: "fingerprint" });
    }
  });
});

describe("passkeyError", () => {
  it("says nothing when she closes the prompt, another request replaces it, or the phone already has one", () => {
    for (const name of ["NotAllowedError", "AbortError", "InvalidStateError"])
      expect(passkeyError(new DOMException("x", name), "Face ID")).toBeNull();
  });

  it("gives the server's words, or a way out for anything else", () => {
    expect(passkeyError(new ApiError(401, "Clé d'accès refusée."), "Face ID")).toBe("Clé d'accès refusée.");
    expect(passkeyError(new Error("boom"), "Face ID")).toBe(
      "Face ID n'a pas marché : réessaie, ou utilise ton mot de passe.",
    );
  });
});
