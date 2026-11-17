import { expect, type Page, test } from "../support/test.ts";

// Signed out on Anna's plan server: no session cookie to start with.
test.use({ baseURL: process.env.E2E_PLAN_URL, session: "" });

/**
 * Keeps the session cookie the server sets and sends it back, like Safari on https. WebKit drops `__Host-`
 * cookies over http://localhost, so the page's own cookie jar cannot be used (see support/test.ts).
 */
async function cookieJar(page: Page) {
  const jar = { cookie: "" };
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch({ headers: { ...route.request().headers(), cookie: jar.cookie } });
    const set = response.headers()["set-cookie"]?.match(/^__Host-annarrive_session=[^;]+/)?.[0];
    if (set) jar.cookie = set;
    await route.fulfill({ response });
  });
  return jar;
}

async function logInWithPassword(page: Page, password: string) {
  await page.getByLabel("Identifiant").fill("Anna");
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Se connecter", exact: true }).click();
}

const signedIn = (page: Page) => expect(page.getByRole("link", { name: "Aujourd'hui" })).toBeVisible();

test("se connecter avec son identifiant et son mot de passe", async ({ page }) => {
  await cookieJar(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Connecte-toi" })).toBeVisible();

  await logInWithPassword(page, "pas-le-bon");
  await expect(page.getByRole("alert")).toHaveText("Identifiant ou mot de passe incorrect.");

  await logInWithPassword(page, process.env.E2E_PASSWORD ?? "");
  // No passkey on this browser: straight to the app.
  await signedIn(page);
});

test("activer Face ID après le mot de passe, puis se connecter d'un geste", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Le faux Face ID passe par le protocole de Chromium (E2E_BROWSER=chromium).");
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  const jar = await cookieJar(page);

  await page.goto("/");
  await logInWithPassword(page, process.env.E2E_PASSWORD ?? "");
  await expect(page.getByRole("heading", { name: "Tu es connectée" })).toBeVisible();
  await page.getByRole("button", { name: "Utiliser Face ID" }).click();
  await signedIn(page);

  // Her session ends: Chromium offers the passkey in the name field's suggestions, and the virtual
  // authenticator picks it at once, so she is back in without a tap.
  jar.cookie = "";
  await page.reload();
  await signedIn(page);

  // Where the browser has no such suggestions, the button does it.
  await page.addInitScript(() => {
    PublicKeyCredential.isConditionalMediationAvailable = async () => false;
  });
  jar.cookie = "";
  await page.reload();
  await page.getByRole("button", { name: "Se connecter avec Face ID" }).click();
  await signedIn(page);
});
