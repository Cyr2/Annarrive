import { describe, expect, it } from "vitest";
import { createMockApi } from "../api/mock/index.ts";
import type { MoveOptions, Strength } from "../api/schemas.ts";
import {
  busyEvent,
  isValidForm,
  isValidSpan,
  repeatLabel,
  revisionEvent,
  strengthEvent,
  strengthShort,
  strengthWhen,
  usualDate,
} from "./add/add.ts";
import { consequenceOf, dayChoices, shortMoment, timeChoices } from "./move/move.ts";
import { findItem, findRun, todayOf } from "./plan/selectors.ts";
import { goalSummary } from "./program/goal.ts";
import { checkIcsUrl, phaseBar, raceLine, settingValue } from "./program/program.ts";
import { agenda, contentKey, itemTime, sessionContext, sheetFor, toneOf, weekStrip } from "./today/today.ts";
import { canContinue, EMPTY, nextStep, painAdvice, progressOf, toInput } from "./unavailable/unavailable.ts";
import {
  classesSpan,
  type Day,
  dayLabel,
  dropTargets,
  isDraggable,
  moveItem,
  refreshLine,
  rowsOf,
  weekDays,
  weekHeading,
} from "./week/week.ts";

const MONDAY = "2026-11-16";
const api = createMockApi({ monday: MONDAY });
const week = await api.week(0);
const today = await api.today();
const program = await api.program();
const run = today.session;
if (!run) throw new Error("seed");

describe("today", () => {
  it("builds the week strip with one dot per kind", () => {
    const strip = weekStrip(week, MONDAY);
    expect(strip).toHaveLength(7);
    expect(strip[0]).toMatchObject({
      letter: "L",
      number: 16,
      today: true,
      dots: ["hard", "revision", "strength", "class"],
    });
    expect(strip[1]?.dots).toEqual(["class"]);
  });

  it("orders the day and names times", () => {
    const day = agenda(week.items, MONDAY);
    expect(day.map((i) => i.title)).toEqual(["Physique", "Révision", "Fractionné", "Haut du corps"]);
    expect(itemTime(run)).toBe("18:00 à 18:50");
    expect(sessionContext(run, MONDAY)).toBe("Fractionné, ce soir 18:00");
  });

  it("picks the tone and what a tap opens", () => {
    expect(toneOf(run)).toBe("hard");
    expect(sheetFor(run)).toEqual({ kind: "session", id: run.id });
    const strength = week.items.find((i) => i.kind === "strength");
    expect(strength && sheetFor(strength)).toMatchObject({ kind: "strength", templateId: "s-upper" });
    const cls = week.items.find((i) => i.kind === "class");
    expect(cls && sheetFor(cls)).toMatchObject({ kind: "event" });
    expect(contentKey(run)).not.toBe(contentKey({ ...run, pace: "5:10" }));
  });
});

describe("week", () => {
  it("lists days with their notes and the heading of the mockup", () => {
    const days = weekDays(week, MONDAY);
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ note: "Aujourd'hui", today: true, runMinutes: 50 });
    expect(days[1]?.note).toBe("Pas de course");
    expect(dayLabel(days[0] as Day)).toBe("Lundi 16 : 1 course, 1 muscu, 1 révision, 1 cours");
    const nbsp = (text: string) => text.replaceAll(" ", " ");
    expect(weekHeading(week, MONDAY)).toEqual({
      range: "16 au 22 novembre",
      load: nbsp("4 courses"),
      time: nbsp("3 h 35"),
      position: nbsp("Semaine 4 sur 12"),
    });
    expect(weekHeading(week, "2026-11-18")).toMatchObject({
      load: nbsp("Il reste 3 sur 4 courses"),
      time: nbsp("2 h 45"),
    });
    expect(weekHeading({ ...week, items: [] }, MONDAY)).toMatchObject({ load: nbsp("Aucune course"), time: undefined });
    expect(weekDays({ ...week, items: [] }, "2026-11-18")[0]).toMatchObject({ note: "Rien de prévu", past: true });
  });

  it("folds a day crowded with classes into one row", () => {
    const cls = (i: number) => ({
      id: `c${i}`,
      kind: "class" as const,
      date: MONDAY,
      start: `${8 + i}:00`,
      end: `${8 + i}:50`,
      title: "TD",
    });
    const crowded = [cls(0), run, cls(1), cls(2), cls(3)];
    const rows = rowsOf(crowded);
    expect(rows.map((r) => r.kind)).toEqual(["classes", "item"]);
    expect(rows[0]?.kind === "classes" && classesSpan(rows[0].items)).toBe("8:00 à 11:50");
    expect(rowsOf(crowded.slice(0, 3))).toHaveLength(3);
  });

  it("locks classes and past weeks", () => {
    const cls = week.items.find((i) => i.kind === "class");
    if (!cls) throw new Error("seed");
    expect(isDraggable(cls, false)).toBe(false);
    expect(isDraggable(run, false)).toBe(true);
    expect(isDraggable(run, true)).toBe(false);
  });

  it("offers drop targets with the server's blocked days", async () => {
    const options = await api.moveOptions(run.id);
    const targets = dropTargets(run, week, MONDAY, options);
    expect(targets).toHaveLength(6);
    expect(targets.find((t) => t.date === "2026-11-21")?.blocked).toBe("Samedi est un jour sans course");
    expect(dropTargets(run, week, "2026-11-18").find((t) => t.date === "2026-11-17")?.blocked).toBe(
      "Ce jour est passé",
    );
  });

  it("moves an item on screen, keeping an event's length", () => {
    const moved = moveItem(week, `${MONDAY}-1`, { date: "2026-11-17", start: "9:00" });
    expect(moved.items.find((i) => i.id === `${MONDAY}-1`)).toMatchObject({ date: "2026-11-17", end: "11:00" });
    expect(
      moveItem(week, run.id, { date: "2026-11-19", start: "18:00" }).items.find((i) => i.id === run.id)?.date,
    ).toBe("2026-11-19");
    expect(refreshLine(undefined)).toContain("rien n'a changé");
    expect(refreshLine("1 cours annulé jeudi")).toContain("1 cours annulé jeudi");
  });
});

describe("move", () => {
  const options: MoveOptions = {
    slots: [{ date: MONDAY, start: "19:30", why: "", consequence: "Rien d'autre ne bouge." }],
    blocked: [{ date: "2026-11-21", reason: "Samedi est un jour sans course" }],
  };
  it("names the moment and the consequence", () => {
    expect(shortMoment({ date: MONDAY, start: "19:30" }, MONDAY)).toBe("ce soir 19:30");
    expect(shortMoment({ date: "2026-11-18", start: "18:00" }, MONDAY)).toBe("mercredi 18:00");
    expect(shortMoment({ date: MONDAY, start: "7:30" }, MONDAY)).toBe("aujourd'hui à 7:30");
    expect(consequenceOf({ date: MONDAY, start: "19:30" }, options)).toBe("Rien d'autre ne bouge.");
    expect(consequenceOf({ date: "2026-11-20", start: "18:00" }, options)).toMatch(/^Si autre chose doit bouger/);
  });
  it("lists days and half hours", () => {
    expect(dayChoices(MONDAY, options)[5]?.blocked).toBe("Samedi est un jour sans course");
    expect(timeChoices("7:00", "8:00")).toEqual(["7:00", "7:30", "8:00"]);
  });
});

describe("add", () => {
  const legs = program.strength.find((t) => t.id === "s-legs") as Strength;
  it("describes and places strength sessions", () => {
    expect(strengthWhen(legs)).toBe("Jeudi 19:30 · chaque semaine");
    expect(strengthWhen({ ...legs, placed: false })).toBe("Pas placée cette semaine");
    expect(usualDate(legs, MONDAY, MONDAY)).toBe("2026-11-19");
    expect(usualDate({ ...legs, weekday: 0 }, MONDAY, "2026-11-18")).toBe("2026-11-23");
    expect(strengthEvent(legs, "2026-11-19", "19:30")).toMatchObject({ kind: "strength", end: "20:30", legs: true });
    expect(repeatLabel("biweekly")).toBe("Toutes les deux semaines");
    expect(strengthShort(legs)).toBe("Jeudi 19:30");
    expect(strengthShort({ ...legs, placed: false })).toBe("Pas placée");
  });
  it("builds revisions and busy slots", () => {
    const form = { title: " ", date: MONDAY, start: "14:00", end: "16:00", minutes: 90, repeat: "weekly" as const };
    expect(revisionEvent(form)).toMatchObject({ end: "15:30", repeat: "weekly" });
    expect(busyEvent(form).title).toBe("Occupée");
    expect(isValidSpan("14:00", "9:00")).toBe(false);
    expect(isValidSpan("9:00", "14:00")).toBe(true);
    const draft = { title: "", date: MONDAY, start: "14:00", end: "9:00", minutes: 60, repeat: "never" as const };
    expect(isValidForm("revision", draft)).toBe(true);
    expect(isValidForm("busy", draft)).toBe(false);
    expect(isValidForm("revision", { ...draft, date: "" })).toBe(false);
  });
});

describe("program", () => {
  it("shows settings, the race line and the current phase", () => {
    expect(settingValue("noRunDays", program.settings)).toBe("Samedi");
    expect(settingValue("noRunDays", { ...program.settings, noRunDays: [] })).toBe("Aucun");
    expect(settingValue("noRunDays", { ...program.settings, noRunDays: [0, 2] })).toBe("Lundi, Mercredi");
    expect(settingValue("noRunDays", { ...program.settings, noRunDays: [0, 2, 5, 6] })).toBe("Lun, Mer, Sam, Dim");
    expect(settingValue("runsPerWeek", program.settings)).toBe("4");
    expect(settingValue("bedtime", program.settings)).toBe("23:00");
    expect(raceLine(program, MONDAY)).toBe("Dimanche 17 janvier · J-62");
    expect(phaseBar(program).find((p) => p.current)?.name).toBe("Base");
  });
  it("summarizes a goal change before it is confirmed", () => {
    const before = { race: "Semi-marathon", distanceKm: 21.1, date: "2027-01-17", targetTime: "1:48:00" };
    expect(goalSummary(before, before, MONDAY)).toBe("Rien ne change pour l'instant.");
    expect(goalSummary(before, { ...before, date: "2027-01-31" }, MONDAY)).toMatch(/^2 semaines de plus\./);
    expect(goalSummary(before, { ...before, date: "2027-01-10", targetTime: undefined }, MONDAY)).toContain(
      "1 semaine de moins, sans chrono",
    );
    expect(goalSummary(before, { ...before, race: "10 km" }, MONDAY)).toMatch(/ta semaine en cours ne change pas\.$/);
  });
  it("says when a race within 7 days, set or removed, changes the current week too (EV20)", () => {
    const before = { race: "Semi-marathon", distanceKm: 21.1, date: "2027-01-17" };
    const soon = { ...before, race: "10 km", distanceKm: 10, date: "2026-11-22" };
    expect(goalSummary(before, soon, "2026-11-17")).toMatch(/Ta semaine devient une semaine de course/);
    expect(goalSummary(soon, before, "2026-11-17")).toMatch(/ta semaine en cours aussi\.$/);
  });
});

describe("pas dispo", () => {
  it("walks one question at a time", () => {
    expect(nextStep("reason", { ...EMPTY, reason: "time" })).toBe("move");
    expect(nextStep("reason", { ...EMPTY, reason: "other" })).toBe("reggie");
    expect(nextStep("reason", { ...EMPTY, reason: "sick" })).toBe("fever");
    expect(nextStep("reason", { ...EMPTY, reason: "pain" })).toBe("zone");
    expect(nextStep("reason", { ...EMPTY, reason: "tired" })).toBe("summary");
    expect(nextStep("zone", EMPTY)).toBe("pain");
    expect(nextStep("pain", EMPTY)).toBe("summary");
  });
  it("only continues once the question is answered", () => {
    expect(canContinue("reason", EMPTY)).toBe(false);
    expect(canContinue("reason", { ...EMPTY, reason: "tired", untilOn: true })).toBe(false);
    expect(canContinue("reason", { ...EMPTY, reason: "tired", untilOn: true, until: "2026-11-18" })).toBe(true);
    expect(canContinue("fever", EMPTY)).toBe(false);
    expect(canContinue("zone", { ...EMPTY, zone: "Genou" })).toBe(true);
    expect(canContinue("pain", EMPTY)).toBe(true);
  });
  it("builds what the server receives", () => {
    expect(toInput({ ...EMPTY, reason: "tired" }, "s")).toEqual({ sessionId: "s", reason: "tired", until: undefined });
    expect(toInput({ ...EMPTY, reason: "sick" }, "s")).toBeUndefined();
    expect(toInput({ ...EMPTY, reason: "sick", fever: true, untilOn: true, until: "x" }, "s")).toEqual({
      sessionId: "s",
      reason: "sick",
      fever: true,
    });
    expect(toInput({ ...EMPTY, reason: "pain", zone: "Pied", pain: 5 }, "s")).toMatchObject({ zone: "Pied", pain: 5 });
    expect(toInput({ ...EMPTY, reason: "pain" }, "s")).toBeUndefined();
    expect(toInput({ ...EMPTY, reason: "other" }, "s")).toBeUndefined();
    expect(painAdvice(2)).toMatch(/^Pas de fractionné/);
    expect(painAdvice(6)).toContain("kiné");
    expect(progressOf("reason", { ...EMPTY, reason: "pain" })).toBeUndefined();
    expect(progressOf("pain", { ...EMPTY, reason: "pain" })).toBe("Douleur · 3 sur 4");
    expect(progressOf("fever", { ...EMPTY, reason: "sick" })).toBe("Malade · 2 sur 3");
  });
});

describe("selectors", () => {
  it("finds items in today or loaded weeks", () => {
    const state = { today, weeks: { 0: week } };
    expect(findRun(state, run.id)?.title).toBe("Fractionné");
    expect(findItem(state, `${MONDAY}-0`)?.title).toBe("Physique");
    expect(findRun(state, `${MONDAY}-0`)).toBeUndefined();
    expect(findItem({ weeks: {} }, "nope")).toBeUndefined();
    expect(todayOf(state)).toBe(MONDAY);
    expect(todayOf({})).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("timetable link", () => {
  it("accepts https and webcal links, and says what to fix otherwise", () => {
    expect(checkIcsUrl("  https://edt.univ.fr/anna.ics ")).toEqual({ url: "https://edt.univ.fr/anna.ics" });
    expect(checkIcsUrl("webcal://edt.univ.fr/anna.ics")).toEqual({ url: "https://edt.univ.fr/anna.ics" });
    expect(checkIcsUrl("").error).toBe("Colle le lien de ton emploi du temps.");
    expect(checkIcsUrl("http://edt.univ.fr/anna.ics").error).toBe("Colle un lien qui commence par https://.");
  });
});
