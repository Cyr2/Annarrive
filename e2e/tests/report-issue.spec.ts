import { expect, onPlan, test } from "../support/test.ts";

onPlan();

test("Réglages : Signaler un souci envoie ses derniers gestes et sa phrase, puis le dit", async ({ page }) => {
  await page.goto("/programme/reglages");
  await page.getByRole("button", { name: /^Lien de ton emploi du temps/ }).waitFor();
  await page.getByRole("textbox", { name: "Signaler un souci" }).fill("La semaine ne s'affiche pas");
  const sent = page.waitForRequest("/api/incidents");
  const answered = page.waitForResponse("/api/incidents");
  await page.getByRole("button", { name: "Envoyer le signalement" }).click();
  await expect(page.getByText("Merci, c'est envoyé.")).toBeVisible();

  const [report] = (await sent).postDataJSON().incidents;
  expect(report).toMatchObject({
    type: "report",
    message: "La semaine ne s'affiche pas",
    route: "/programme/reglages",
  });
  expect(report.breadcrumbs.map((b: { kind: string }) => b.kind)).toEqual(expect.arrayContaining(["route", "api"]));
  expect((await answered).status()).toBe(204);
});
