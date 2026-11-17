import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/errors.ts";
import { passkeyError, unlockName } from "./unlock.ts";

describe("unlockName", () => {
  it("names what unlocks the passkey on each device", () => {
    expect(unlockName("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)")).toBe("Face ID");
    expect(unlockName("Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)")).toBe("Touch ID");
    expect(unlockName("Mozilla/5.0 (Linux; Android 16; Pixel 9)")).toBe("ton empreinte");
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
