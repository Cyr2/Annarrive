import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword, newPassword, verifyPassword } from "../src/services/password.ts";
import { MONDAY_8AM, postLogin, setup } from "./helpers.ts";

// The browser's signatures cannot be made here: the library's checks are mocked, but they still call the
// app's challenge check with the challenge the "browser" signed, so its single use and expiry are tested.
const webauthn = vi.hoisted(() => ({ registration: vi.fn(), authentication: vi.fn() }));
vi.mock("@simplewebauthn/server", async (original) => ({
  ...(await original<typeof import("@simplewebauthn/server")>()),
  verifyRegistrationResponse: webauthn.registration,
  verifyAuthenticationResponse: webauthn.authentication,
}));

type ChallengeCheck = { expectedChallenge: (challenge: string) => boolean; response: { response: Signed } };
type Signed = { clientDataJSON: string };

const signedChallenge = (response: Signed): string =>
  JSON.parse(Buffer.from(response.clientDataJSON, "base64url").toString()).challenge;
const clientData = (challenge: string) => Buffer.from(JSON.stringify({ challenge })).toString("base64url");

const attestation = (challenge: string, id = "cred-1") => ({
  id,
  rawId: id,
  type: "public-key",
  clientExtensionResults: {},
  response: { clientDataJSON: clientData(challenge), attestationObject: "o2NmbXRkbm9uZQ", transports: ["internal"] },
});
const assertion = (challenge: string, id = "cred-1") => ({
  id,
  rawId: id,
  type: "public-key",
  clientExtensionResults: {},
  response: { clientDataJSON: clientData(challenge), authenticatorData: "AAAA", signature: "AAAA" },
});

beforeEach(() => {
  webauthn.registration.mockImplementation(async ({ expectedChallenge, response }: ChallengeCheck) => {
    if (!expectedChallenge(signedChallenge(response.response))) throw new Error("Unexpected challenge");
    return {
      verified: true,
      registrationInfo: {
        credential: { id: "cred-1", publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ["internal"] },
      },
    };
  });
  webauthn.authentication.mockImplementation(async ({ expectedChallenge, response }: ChallengeCheck) => {
    if (!expectedChallenge(signedChallenge(response.response))) throw new Error("Unexpected challenge");
    return { verified: true, authenticationInfo: { newCounter: 7 } };
  });
});

/** A browser on the app: keeps the session cookie it is given, as Safari does. */
function device(t: ReturnType<typeof setup>, ip = "203.0.113.7") {
  let cookie = "";
  const post = async (path: string, body?: unknown, site = "same-origin") => {
    const response = await t.app.request(path, {
      method: "POST",
      // As Traefik forwards it: whatever the client claimed first, then its real address last.
      headers: {
        cookie,
        "content-type": "application/json",
        "sec-fetch-site": site,
        "x-forwarded-for": `10.9.9.9, ${ip}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = response.headers.get("set-cookie")?.split(";")[0];
    if (set) cookie = set;
    const text = await response.text();
    return { status: response.status, json: text ? JSON.parse(text) : null, set };
  };
  const get = async (path: string) => (await t.app.request(path, { headers: { cookie } })).status;
  return { post, get };
}

async function withAccount() {
  const t = setup();
  const password = await t.services.auth.resetPassword("anna");
  return { t, password, phone: device(t) };
}

describe("password", () => {
  it("hashes with scrypt and a salt, never in clear", async () => {
    const [a, b] = [await hashPassword("secret"), await hashPassword("secret")];
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$[\w-]+\$[\w-]+$/);
    expect(a).not.toBe(b);
    expect(await verifyPassword("secret", a)).toBe(true);
    expect(await verifyPassword("Secret", a)).toBe(false);
    expect(await verifyPassword("secret", "md5$abc")).toBe(false);
  });

  it("makes passwords easy to type: three groups of four, no 0, o, 1, l or i", () => {
    expect(newPassword()).toMatch(/^[a-hj-kmnp-z2-9]{4}-[a-hj-kmnp-z2-9]{4}-[a-hj-kmnp-z2-9]{4}$/);
  });

  it("opens a 180-day session for the right name and password", async () => {
    const { t, password, phone } = await withAccount();
    expect(t.stores.user.get("anna")?.passwordHash).not.toContain(password);

    const login = await phone.post("/api/auth/password", { username: " Anna ", password });

    expect(login.status).toBe(204);
    expect(login.set).toMatch(/^__Host-annarrive_session=/);
    expect(await phone.get("/api/today")).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown name", async () => {
    const { phone } = await withAccount();
    const wrong = await phone.post("/api/auth/password", { username: "anna", password: "nope" });
    const unknown = await phone.post("/api/auth/password", { username: "zoe", password: "nope" });
    expect(wrong).toEqual({ status: 401, json: { error: "Identifiant ou mot de passe incorrect." }, set: undefined });
    expect(unknown).toEqual(wrong);
  });

  it("blocks passwords for 15 minutes after 5 failures, even the right one", async () => {
    const { t, password, phone } = await withAccount();
    for (let i = 0; i < 5; i++) await phone.post("/api/auth/password", { username: "anna", password: "nope" });
    expect((await phone.post("/api/auth/password", { username: "anna", password })).status).toBe(429);

    t.setNow(new Date(MONDAY_8AM.getTime() + 15 * 60_000));
    expect((await phone.post("/api/auth/password", { username: "anna", password })).status).toBe(204);
  });

  it("refuses a login posted from another site, and a malformed one", async () => {
    const { password, phone } = await withAccount();
    expect((await phone.post("/api/auth/password", { username: "anna", password }, "cross-site")).status).toBe(403);
    expect((await phone.post("/api/auth/password", { username: "anna" })).status).toBe(400);
    expect((await phone.post("/api/auth/password", { username: "<script>", password })).status).toBe(400);
  });

  it("a new password from the CLI replaces the old one and ends the account's sessions", async () => {
    const { t, password, phone } = await withAccount();
    await phone.post("/api/auth/password", { username: "anna", password });
    const fresh = await t.services.auth.resetPassword("anna");
    expect(await phone.get("/api/today")).toBe(401);
    expect((await phone.post("/api/auth/password", { username: "anna", password })).status).toBe(401);
    expect((await phone.post("/api/auth/password", { username: "anna", password: fresh })).status).toBe(204);
  });

  it("blocks only the client that failed: Anna, from her own address, still gets in", async () => {
    const { t, password } = await withAccount();
    const attacker = device(t, "198.51.100.1");
    for (let i = 0; i < 6; i++) await attacker.post("/api/auth/password", { username: "anna", password: "nope" });
    expect((await attacker.post("/api/auth/password", { username: "anna", password })).status).toBe(429);
    expect((await device(t).post("/api/auth/password", { username: "anna", password })).status).toBe(204);
  });

  it("counts parallel attempts too: no more than 5 guesses get checked", async () => {
    const { phone } = await withAccount();
    const guesses = await Promise.all(
      Array.from({ length: 10 }, () => phone.post("/api/auth/password", { username: "anna", password: "nope" })),
    );
    expect(guesses.filter((g) => g.status === 401)).toHaveLength(5);
    expect(guesses.filter((g) => g.status === 429)).toHaveLength(5);
  });

  it("limits each client to 10 password requests a minute, right or wrong", async () => {
    const { t, password, phone } = await withAccount();
    for (let i = 0; i < 10; i++)
      expect((await phone.post("/api/auth/password", { username: "anna", password })).status).toBe(204);
    expect((await phone.post("/api/auth/password", { username: "anna", password })).status).toBe(429);
    expect((await device(t, "198.51.100.2").post("/api/auth/password", { username: "anna", password })).status).toBe(
      204,
    );
  });
});

describe("login link", () => {
  it("made for an account, it leads to the Face ID offer", async () => {
    const { t } = await withAccount();
    const token = new URL(t.services.auth.createLoginLink("https://annarrive.test", "anna")).searchParams.get("token");
    const response = await postLogin(t.app, token ?? "");
    expect(response.headers.get("location")).toBe("/face-id");
  });

  it("still works after any number of wrong links or passwords: it is the admin's way back", async () => {
    const { t } = await withAccount();
    for (let i = 0; i < 10; i++) expect((await postLogin(t.app, `wrong${i}`)).status).toBe(401);
    for (let i = 0; i < 6; i++) await device(t).post("/api/auth/password", { username: "anna", password: "nope" });
    expect((await t.login()).status).toBe(302);
  });

  it("refuses to make a link for an unknown account", () => {
    expect(() => setup().services.auth.createLoginLink("https://annarrive.test", "zoe")).toThrow("Aucun compte");
  });
});

/** Signed in with the password, then Face ID added: what the first login on a phone does. */
async function withPasskey() {
  const account = await withAccount();
  const { phone, password } = account;
  await phone.post("/api/auth/password", { username: "anna", password });
  const options = await phone.post("/api/passkeys/options");
  expect((await phone.post("/api/passkeys", attestation(options.json.challenge))).status).toBe(204);
  return account;
}

describe("adding Face ID", () => {
  it("asks this site's platform authenticator for a discoverable passkey with user verification", async () => {
    const { phone, password } = await withAccount();
    await phone.post("/api/auth/password", { username: "anna", password });

    const { status, json } = await phone.post("/api/passkeys/options");

    expect(status).toBe(200);
    expect(json).toMatchObject({
      rp: { id: "annarrive.test", name: "Annarrivé" },
      user: { name: "anna" },
      attestation: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        userVerification: "required",
      },
      excludeCredentials: [],
    });
  });

  it("stores the passkey for the account, then excludes it so the phone does not add it twice", async () => {
    const { t, phone } = await withPasskey();
    expect(t.stores.passkey.get("cred-1")).toMatchObject({ userId: "anna", publicKey: "AQID", counter: 0 });
    expect(webauthn.registration).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedOrigin: "https://annarrive.test",
        expectedRPID: "annarrive.test",
        requireUserVerification: true,
      }),
    );
    const again = await phone.post("/api/passkeys/options");
    expect(again.json.excludeCredentials).toEqual([{ id: "cred-1", type: "public-key", transports: ["internal"] }]);
  });

  it("refuses an answer to a challenge it did not give, or one used already", async () => {
    const { phone, password } = await withAccount();
    await phone.post("/api/auth/password", { username: "anna", password });
    expect((await phone.post("/api/passkeys", attestation("made-up"))).status).toBe(400);

    const options = await phone.post("/api/passkeys/options");
    expect((await phone.post("/api/passkeys", attestation(options.json.challenge))).status).toBe(204);
    expect((await phone.post("/api/passkeys", attestation(options.json.challenge))).status).toBe(400);
  });

  it("refuses an answer after 5 minutes", async () => {
    const { t, phone, password } = await withAccount();
    await phone.post("/api/auth/password", { username: "anna", password });
    const options = await phone.post("/api/passkeys/options");
    t.setNow(new Date(MONDAY_8AM.getTime() + 5 * 60_000));
    expect((await phone.post("/api/passkeys", attestation(options.json.challenge))).status).toBe(400);
  });

  it("needs a signed-in account: no session, or a session from a link without a name, cannot add one", async () => {
    const t = setup();
    expect((await device(t).post("/api/passkeys/options")).status).toBe(401);
    await t.login();
    expect(await t.call("POST", "/api/passkeys/options")).toEqual({
      status: 403,
      json: { error: "Connecte-toi avec ton identifiant et ton mot de passe pour activer Face ID." },
    });
  });

  it("refuses a passkey whose id is already stored, whoever holds it", async () => {
    const { t } = await withPasskey();
    const password = await t.services.auth.resetPassword("darius");
    const other = device(t, "198.51.100.4");
    await other.post("/api/auth/password", { username: "darius", password });
    const options = await other.post("/api/passkeys/options");
    expect((await other.post("/api/passkeys", attestation(options.json.challenge))).status).toBe(400);
    expect(t.stores.passkey.get("cred-1")?.userId).toBe("anna");
  });

  it("refuses a malformed answer before any check", async () => {
    const { phone, password } = await withAccount();
    await phone.post("/api/auth/password", { username: "anna", password });
    expect((await phone.post("/api/passkeys", { id: "cred-1" })).status).toBe(400);
    expect(webauthn.registration).not.toHaveBeenCalled();
  });
});

describe("signing in with Face ID", () => {
  it("asks for any passkey of this site, with user verification", async () => {
    const { json } = await device(setup()).post("/api/auth/passkey/options");
    expect(json).toMatchObject({ rpId: "annarrive.test", userVerification: "required" });
    expect(json.allowCredentials ?? []).toEqual([]);
  });

  it("limits options per client, so a flood from one address cannot stop Anna's Face ID", async () => {
    const { t } = await withPasskey();
    const flood = device(t, "198.51.100.3");
    const phone = device(t);
    const options = await phone.post("/api/auth/passkey/options");
    for (let i = 0; i < 30; i++) await flood.post("/api/auth/passkey/options");
    for (let i = 0; i < 30; i++) await device(t, `198.51.100.${10 + i}`).post("/api/auth/passkey/options");
    expect((await flood.post("/api/auth/passkey/options")).status).toBe(429);
    expect((await phone.post("/api/auth/passkey/options")).status).toBe(200);
    // Her challenge, asked before the flood, is still there.
    expect((await phone.post("/api/auth/passkey", assertion(options.json.challenge))).status).toBe(204);
  });

  it("opens a session for the passkey's account and keeps its new counter", async () => {
    const { t } = await withPasskey();
    const phone = device(t);
    const options = await phone.post("/api/auth/passkey/options");

    const login = await phone.post("/api/auth/passkey", assertion(options.json.challenge));

    expect(login.status).toBe(204);
    expect(login.set).toMatch(/^__Host-annarrive_session=/);
    expect(await phone.get("/api/today")).toBe(200);
    expect(t.stores.passkey.get("cred-1")).toMatchObject({ counter: 7, lastUsedAt: MONDAY_8AM.toISOString() });
    expect(webauthn.authentication).toHaveBeenCalledWith(
      expect.objectContaining({
        credential: { id: "cred-1", publicKey: Buffer.from([1, 2, 3]), counter: 0, transports: ["internal"] },
        requireUserVerification: true,
      }),
    );
  });

  it("refuses a signature the library rejects (a counter that went back, a wrong origin)", async () => {
    const { t } = await withPasskey();
    webauthn.authentication.mockRejectedValueOnce(new Error("Response counter value 0 was lower than expected 7"));
    const phone = device(t);
    const options = await phone.post("/api/auth/passkey/options");
    const login = await phone.post("/api/auth/passkey", assertion(options.json.challenge));
    expect(login).toMatchObject({ status: 401, set: undefined });
    expect(login.json.error).toContain("Clé d'accès refusée");
  });

  it("refuses a replayed answer", async () => {
    const { t } = await withPasskey();
    const phone = device(t);
    const options = await phone.post("/api/auth/passkey/options");
    expect((await phone.post("/api/auth/passkey", assertion(options.json.challenge))).status).toBe(204);
    expect((await phone.post("/api/auth/passkey", assertion(options.json.challenge))).status).toBe(401);
  });

  it("still works while passwords are blocked", async () => {
    const { t } = await withPasskey();
    const phone = device(t);
    for (let i = 0; i < 6; i++) await phone.post("/api/auth/password", { username: "anna", password: "nope" });
    const options = await phone.post("/api/auth/passkey/options");
    expect((await phone.post("/api/auth/passkey", assertion(options.json.challenge))).status).toBe(204);
  });

  it("refuses a revoked passkey, and says to use the password", async () => {
    const { t, phone: lost } = await withPasskey();
    await t.login();
    expect(t.services.auth.accounts()).toMatchObject([{ id: "anna", hasPassword: true, passkeys: [{ id: "cred-1" }] }]);
    t.services.auth.revokePasskey("cred-1");
    expect(t.services.auth.accounts()[0]?.passkeys).toEqual([]);
    // The lost phone's session ends with it; a session of no account (the admin's link) stays.
    expect(await lost.get("/api/today")).toBe(401);
    expect((await t.call("GET", "/api/today")).status).toBe(200);
    expect(() => t.services.auth.revokePasskey("cred-1")).toThrow("Aucune clé");

    const phone = device(t);
    const options = await phone.post("/api/auth/passkey/options");
    const login = await phone.post("/api/auth/passkey", assertion(options.json.challenge));
    expect(login).toMatchObject({
      status: 401,
      json: { error: "Cette clé d'accès n'est plus reconnue : connecte-toi avec ton mot de passe." },
    });
  });
});
