import { banner, expect, onPlan, type Page, test } from "../support/test.ts";

onPlan();

const path = (page: Page) => new URL(page.url()).pathname;
const gear = (page: Page) => page.getByRole("button", { name: "Réglages" });

test("la roue ouvre Réglages, l'onglet Programme reste allumé, et chaque retour ramène à Programme", async ({
  page,
}) => {
  await page.goto("/programme");
  const tab = page.getByRole("link", { name: "Programme" });
  // Programme is only the programme now: no setting on it.
  await expect(page.getByRole("button", { name: /^Courses par semaine/ })).toHaveCount(0);

  await gear(page).click();
  await expect(page.getByRole("heading", { name: "Réglages", level: 1 })).toBeVisible();
  expect(path(page)).toBe("/programme/reglages");
  await expect(tab).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: "Programme", exact: true }).click();
  await expect(page.getByRole("article", { name: "Ton objectif" })).toBeVisible();
  expect(path(page)).toBe("/programme");

  // The system's Back pops Réglages too.
  await gear(page).click();
  await expect(page.getByRole("button", { name: /^Courses par semaine/ })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("article", { name: "Ton objectif" })).toBeVisible();

  // The Programme tab touched again brings back its root, and Back then leaves Programme instead of reopening it.
  await gear(page).click();
  await expect(page.getByRole("button", { name: /^Courses par semaine/ })).toBeVisible();
  await tab.click();
  await expect(page.getByRole("article", { name: "Ton objectif" })).toBeVisible();
  expect(path(page)).toBe("/programme");
});

test("Heure préférée : se règle au champ d'heure, puis revient à l'automatique", async ({ page }) => {
  await page.goto("/programme/reglages");
  const row = page.getByRole("button", { name: /^Heure préférée/ });
  await expect(row).toContainText("Automatique");
  await row.click();
  const sheet = page.getByRole("dialog", { name: "Heure préférée" });
  await expect(sheet).toContainText("Reggie place tes courses autour de cette heure quand c'est possible.");
  await sheet.getByLabel("Heure").fill("07:30");
  await sheet.getByRole("button", { name: "Enregistrer" }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toContainText("7:30");

  await row.click();
  await sheet.getByRole("button", { name: "Revenir à l'automatique" }).click();
  await expect(sheet).toBeHidden();
  await expect(row).toContainText("Automatique");
});

type Day = {
  date: string;
  sessions: { id: string; start: string; durMin: number; status: string }[];
  events: { start: string }[];
};
const minutes = (at: string) => Number(at.slice(11, 13)) * 60 + Number(at.slice(14, 16));
const week = (page: Page): Promise<{ days: Day[] }> =>
  page.evaluate(async () => (await fetch("/api/weeks/2026-W48")).json());
const send = (page: Page, method: string, url: string, body?: unknown) =>
  page.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(u, { method: m, headers: { "content-type": "application/json" }, body: b });
      return r.json();
    },
    [method, url, body === undefined ? undefined : JSON.stringify(body)] as const,
  );

test("Après une course, avant un cours : une course finit au moins ce temps avant ce qui suit", async ({ page }) => {
  await page.goto("/programme/reglages");
  const [day, run] = (await week(page)).days.flatMap((d) => d.sessions.map((s) => [d, s] as const))[0] ?? [];
  if (!day || !run) throw new Error("Aucune course la semaine prochaine");
  // Something right after her run, 15 min after its end: H1 treats it as a class.
  const end = minutes(run.start) + run.durMin;
  const at = (m: number) =>
    `${day.date}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const busy = await send(page, "POST", "/api/events", {
    kind: "unavailable",
    title: "Rendez-vous",
    recurrence: "none",
    start: at(end + 15),
    end: at(end + 75),
  });

  expect(busy, JSON.stringify(busy)).toHaveProperty("change.id");
  const row = page.getByRole("button", { name: /^Après une course, avant un cours/ });
  await row.click();
  const sheet = page.getByRole("dialog", { name: "Après une course, avant un cours" });
  await expect(sheet).toContainText("Combien de temps te faut-il entre la fin d'une course et le début d'un cours ?");
  await sheet.getByLabel("Temps, heures et minutes").fill("01:00");
  await sheet.getByRole("button", { name: "Enregistrer" }).click();
  const saved = banner(page, "Réglages enregistrés");
  await expect(saved).toBeVisible();
  await expect(row).toContainText("1 h");

  // The run 15 min before it moved, and every run of the week ends an hour or more before what follows that day.
  const after = (await week(page)).days;
  expect(after.flatMap((d) => d.sessions).find((s) => s.id === run.id)?.start).not.toBe(run.start);
  for (const d of after)
    for (const s of d.sessions.filter((x) => x.status === "planned")) {
      const ends = minutes(s.start) + s.durMin;
      for (const e of d.events.filter((x) => minutes(x.start) >= ends))
        expect(minutes(e.start) - ends, `${s.id} avant ${e.start}`).toBeGreaterThanOrEqual(60);
    }

  await saved.getByRole("button", { name: "Annuler" }).click();
  await expect(row).toContainText("min");
  await send(page, "POST", `/api/changes/${busy.change.id}/undo`);
});

test("Ta dernière course : trois questions, Enregistrer dans le pied, et la ligne de Ton niveau suit", async ({
  page,
}) => {
  await page.goto("/programme");
  const row = page.getByRole("button", { name: /^Ta dernière course/ });
  await row.click();
  const sheet = page.getByRole("dialog", { name: "Ta dernière course" });
  await expect(sheet.getByRole("heading")).toHaveText([
    "Ta dernière course",
    "Quelle distance ?",
    "En combien de temps ?",
    "Il y a combien de temps ?",
  ]);
  await sheet.getByRole("button", { name: "10 km", exact: true }).click();
  await sheet.getByLabel("Heures").fill("0");
  await sheet.getByLabel("Minutes").fill("50");
  await sheet.getByLabel("Il y a").selectOption({ label: "3 mois" });
  const save = sheet.getByRole("button", { name: "Enregistrer" });
  expect(await save.evaluate((el) => Boolean(el.closest("fieldset.sheet-footer")))).toBe(true);
  await save.click();
  const done = banner(page, "Allures recalculées");
  await expect(done).toBeVisible();
  await expect(row).toContainText("10 km en 50:00, il y a 3 mois");
  await done.getByRole("button", { name: "Annuler" }).click();
  await expect(banner(page, "Changement annulé")).toBeVisible();
});
