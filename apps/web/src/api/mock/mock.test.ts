import { describe, expect, it } from "vitest";
import { createMockApi } from "./index.ts";

const MONDAY = "2026-11-16";
const make = (scenario?: Parameters<typeof createMockApi>[0]) => createMockApi({ monday: MONDAY, ...scenario });

describe("mock api", () => {
  it("shows the mockup's run day", async () => {
    const today = await make().today();
    expect(today.date).toBe(MONDAY);
    expect(today.session?.title).toBe("Fractionné");
    expect(today.goal).toEqual({ label: "Semi", daysLeft: 62 });
    expect(today.activity).toBeUndefined();
  });

  it("shows a rest day with the next run", async () => {
    const today = await make({ scenario: "rest" }).today();
    expect(today.session).toBeUndefined();
    expect(today.next?.title).toBe("Footing facile");
    expect(today.next?.start).toBe("7:30");
  });

  it("shows the run once done, with the feeling to ask", async () => {
    const today = await make({ scenario: "done" }).today();
    expect(today.session).toBeUndefined();
    expect(today.activity?.askFeel).toBe(true);
  });

  it("shows a lightened session with its reason and a failed watch sync", async () => {
    const { session } = await make({ scenario: "light" }).today();
    expect(session?.mainSet).toBe("4 × 800 m");
    expect(session?.lightened).toMatch(/^Allégée/);
    expect(session?.watch).toBe("failed");
  });

  it("has a worst case with the longest realistic values", async () => {
    const api = make({ scenario: "worst" });
    expect((await api.today()).session?.title).toBe("Fractionné en côte, retour en descente");
    expect((await api.program()).goal.targetTag).toBe("ambitious");
  });

  it("sums the week like the mockup: 4 runs", async () => {
    const week = await make().week(0);
    expect(week.items.filter((i) => i.kind === "run")).toHaveLength(4);
    expect(week.readOnly).toBe(false);
    expect((await make().week(-1)).readOnly).toBe(true);
  });

  it("moves a session and undoes it exactly", async () => {
    const api = make();
    const before = await api.week(0);
    const change = await api.move(`${MONDAY}-2`, { date: "2026-11-19", start: "18:00" });
    expect(change.message).toBe("Séance déplacée à jeudi 18:00");
    expect((await api.today()).session).toBeUndefined();
    await api.undo(change.changeId);
    expect(await api.week(0)).toEqual(before);
    await expect(api.undo(change.changeId)).rejects.toThrow();
  });

  it("swaps two runs when the target day already has one", async () => {
    const api = make();
    await api.move(`${MONDAY}-2`, { date: "2026-11-18", start: "18:00" });
    const week = await api.week(0);
    const runs = week.items.filter((i) => i.kind === "run").map((i) => [i.title, i.date]);
    expect(runs).toContainEqual(["Fractionné", "2026-11-18"]);
    expect(runs).toContainEqual(["Footing facile", MONDAY]);
  });

  it("moves an event with its length", async () => {
    const api = make();
    await api.move(`${MONDAY}-1`, { date: "2026-11-17", start: "15:00" });
    const revision = (await api.week(0)).items.find((i) => i.id === `${MONDAY}-1`);
    expect(revision).toMatchObject({ date: "2026-11-17", start: "15:00", end: "17:00" });
  });

  it("proposes slots that respect the rules", async () => {
    const options = await make().moveOptions(`${MONDAY}-2`);
    expect(options.slots[0]).toMatchObject({ date: MONDAY, start: "19:30" });
    expect(options.blocked).toContainEqual({ date: "2026-11-21", reason: "Samedi est un jour sans course" });
    expect(options.blocked.some((b) => b.reason.includes("jambes"))).toBe(true);
  });

  it("changes a session into a shorter one", async () => {
    const api = make();
    const options = await api.changeOptions(`${MONDAY}-2`);
    expect(options.map((o) => o.id)).toEqual(["shorter", "easier", "equivalent", "jog"]);
    await api.change(`${MONDAY}-2`, "jog");
    expect((await api.today()).session).toMatchObject({ title: "Footing tranquille", durationMin: 30 });
  });

  it("handles pas dispo: pain over 4 advises rest but keeps an easy run", async () => {
    const api = make();
    const input = { sessionId: `${MONDAY}-2`, reason: "pain" as const, zone: "Mollet", pain: 6 };
    const rows = await api.previewUnavailable(input);
    expect(rows).toHaveLength(1);
    expect((await api.today()).session?.title).toBe("Fractionné");
    await api.unavailable(input);
    const session = (await api.today()).session;
    expect(session).toMatchObject({ title: "Footing tranquille", durationMin: 20 });
    expect(session?.lightened).toContain("vélo");
  });

  it("handles pas dispo: tired removes today's run", async () => {
    const api = make();
    await api.unavailable({ sessionId: `${MONDAY}-2`, reason: "tired" });
    expect((await api.today()).session).toBeUndefined();
  });

  it("adds a busy slot and pushes the run it covers", async () => {
    const api = make();
    const change = await api.addEvent({ kind: "busy", title: "Soirée", date: MONDAY, start: "17:30", end: "19:00" });
    expect(change.rows).toHaveLength(1);
    expect((await api.today()).session?.start).toBe("19:30");
  });

  it("refreshes the timetable once with a cancelled class", async () => {
    const api = make();
    expect((await api.refreshTimetable()).summary).toBe("1 cours annulé jeudi");
    expect((await api.refreshTimetable()).summary).toBeUndefined();
  });

  it("saves, places and deletes a strength template", async () => {
    const api = make();
    const program = await api.program();
    const legs = program.strength.find((t) => t.id === "s-legs");
    if (!legs) throw new Error("seed");
    await api.saveStrength({ ...legs, weekday: 4 });
    const week = await api.week(0);
    expect(week.items.find((i) => i.kind === "strength" && i.templateId === "s-legs")?.date).toBe("2026-11-20");
    await api.deleteStrength("s-legs", "all");
    expect((await api.program()).strength.some((t) => t.id === "s-legs")).toBe(false);
  });

  it("updates settings, goal, watch and feelings", async () => {
    const api = make({ scenario: "done" });
    await api.updateSettings({ runsPerWeek: 3 });
    await api.updateGoal({ race: "10 km", distanceKm: 10, date: "2027-02-01", targetTime: "45:00" });
    await api.logFeel("a-1", "hard");
    await api.reconnectWatch();
    const program = await api.program();
    expect(program.settings.runsPerWeek).toBe(3);
    expect(program.goal.targetTag).toBe("reachable");
    expect((await api.today()).activity?.feel).toBe("hard");
    await api.stopProgram();
    expect((await api.program()).maintenance).toBe(true);
  });
});
