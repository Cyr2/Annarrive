import { beforeEach, describe, expect, it, vi } from "vitest";
import { hasPasskey, logInWithPasskey, logInWithPassword, registerPasskey } from "./auth.ts";

const browser = vi.hoisted(() => ({ startAuthentication: vi.fn(), startRegistration: vi.fn() }));
vi.mock("@simplewebauthn/browser", () => browser);

// Not a credential: any text stands for what she types.
const PASSWORD = "x".repeat(12);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const REQUEST = { challenge: "abc", rpId: "annarrive.test", userVerification: "required", extensions: { x: 1 } };
const CREATION = {
  rp: { id: "annarrive.test", name: "Annarrivé" },
  user: { id: "dXNlcg", name: "anna", displayName: "" },
  challenge: "abc",
  pubKeyCredParams: [{ alg: -7, type: "public-key" }],
  authenticatorSelection: {
    authenticatorAttachment: "platform",
    residentKey: "preferred",
    userVerification: "required",
  },
};

beforeEach(() => {
  browser.startAuthentication.mockResolvedValue({ id: "cred" });
  browser.startRegistration.mockResolvedValue({ id: "cred" });
});

describe("auth calls", () => {
  it("posts the password and passes on the server's message when it refuses", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
    await logInWithPassword("anna", PASSWORD, fetcher);
    expect(fetcher).toHaveBeenCalledWith("/api/auth/password", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({
      username: "anna",
      password: PASSWORD,
    });

    const refusing = vi.fn<typeof fetch>(async () => json({ error: "Identifiant ou mot de passe incorrect." }, 401));
    await expect(logInWithPassword("anna", "x", refusing)).rejects.toThrow("Identifiant ou mot de passe incorrect.");
  });

  it("says the network is down when the server cannot be reached", async () => {
    const offline = vi.fn<typeof fetch>(async () => {
      throw new TypeError("Failed to fetch");
    });
    await expect(logInWithPassword("anna", "x", offline)).rejects.toThrow("Pas de connexion au serveur");
  });

  it("signs in with a passkey: validated options to the browser, its answer to the server", async () => {
    const fetcher = vi.fn<typeof fetch>(async (path) =>
      path === "/api/auth/passkey/options" ? json(REQUEST) : new Response(null, { status: 204 }),
    );
    await logInWithPasskey(true, fetcher);
    expect(browser.startAuthentication).toHaveBeenCalledWith({
      optionsJSON: { challenge: "abc", rpId: "annarrive.test", userVerification: "required" },
      useBrowserAutofill: true,
    });
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/auth/passkey");
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ id: "cred" }));
  });

  it("adds a passkey from validated options", async () => {
    const fetcher = vi.fn<typeof fetch>(async (path) =>
      path === "/api/passkeys/options" ? json(CREATION) : new Response(null, { status: 204 }),
    );
    await registerPasskey(fetcher);
    expect(browser.startRegistration).toHaveBeenCalledWith({ optionsJSON: CREATION });
    expect(fetcher.mock.calls[1]?.[0]).toBe("/api/passkeys");
  });

  // Audit iPhone F5: an error offered « Activer Face ID » to an account that already had it.
  it("reads whether the account holds a passkey, and says nothing when it cannot tell", async () => {
    expect(await hasPasskey(vi.fn<typeof fetch>(async () => json({ hasPasskey: true })))).toBe(true);
    expect(await hasPasskey(vi.fn<typeof fetch>(async () => json({ hasPasskey: false })))).toBe(false);
    expect(await hasPasskey(vi.fn<typeof fetch>(async () => json({ nope: 1 })))).toBeNull();
    expect(await hasPasskey(vi.fn<typeof fetch>(() => Promise.reject(new TypeError("offline"))))).toBeNull();
    expect(await hasPasskey(vi.fn<typeof fetch>(async () => new Response("", { status: 500 })))).toBeNull();
  });

  it("refuses options it cannot read, before the browser prompts", async () => {
    const fetcher = vi.fn<typeof fetch>(async () => json({ challenge: 42 }));
    await expect(registerPasskey(fetcher)).rejects.toThrow("Ça n'a pas marché");
    expect(browser.startRegistration).not.toHaveBeenCalled();
  });
});
