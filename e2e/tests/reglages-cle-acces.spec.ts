import { expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

// Chromium cannot run a real passkey ceremony: the account's answer is mocked.
const answer = (page: Page, hasPasskey: boolean) =>
  page.route("**/api/session", (route) => route.fulfill({ json: { hasPasskey } }));

test("Réglages montre la clé d'accès comme activée, sans bouton, quand le compte en a une", async ({ page }) => {
  await answer(page, true);
  await page.goto("/programme/reglages");
  const row = page.locator(".row").filter({ hasText: /(Face ID|Touch ID|Empreinte) activée?/ });
  await expect(row).toBeVisible();
  await expect(page.getByRole("button", { name: /^Activer / })).toHaveCount(0);
  await expect(row.getByRole("button")).toHaveCount(0);
});

test("Réglages propose d'activer la clé d'accès quand le compte n'en a pas", async ({ page }) => {
  await answer(page, false);
  await page.goto("/programme/reglages");
  await expect(page.getByRole("button", { name: /^Activer (Face ID|Touch ID|l'empreinte)$/ })).toBeVisible();
  await expect(page.getByText(/activée?$/)).toHaveCount(0);
});
