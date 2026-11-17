import { describe, expect, it } from "vitest";
import { cx } from "./cx.ts";
import {
  addDays,
  addMinutes,
  ago,
  daysBetween,
  dayTitle,
  decimal,
  duration,
  isoWeek,
  longDate,
  mondayOf,
  pastMoment,
  relativeDay,
  relativeMoment,
  span,
  timeOf,
  weekday,
  weekRange,
} from "./date.ts";

describe("date", () => {
  it("walks the calendar across months", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(weekday("2026-11-16")).toBe(0);
    expect(weekday("2026-11-22")).toBe(6);
    expect(mondayOf("2026-11-22")).toBe("2026-11-16");
    expect(daysBetween("2026-11-16", "2027-01-17")).toBe(62);
  });

  it("names days like the mockups", () => {
    expect(dayTitle("2026-11-16")).toBe("Lundi 16");
    expect(longDate("2027-01-17")).toBe("dimanche 17 janvier");
    expect(weekRange("2026-11-16")).toBe("16 au 22 novembre");
    expect(weekRange("2026-11-30")).toBe("30 novembre au 6 décembre");
  });

  it("says when, relative to today", () => {
    const today = "2026-11-16";
    expect(relativeDay(today, today)).toBe("Aujourd'hui");
    expect(relativeDay("2026-11-17", today)).toBe("Demain");
    expect(relativeDay("2026-11-18", today)).toBe("Mercredi");
    expect(relativeDay("2026-11-25", today)).toBe("Mercredi 25");
    expect(relativeMoment(today, "18:00", today)).toBe("Ce soir 18:00");
    expect(relativeMoment(today, "7:30", today)).toBe("Aujourd'hui 7:30");
    expect(pastMoment(today, "18:00", today)).toBe("Aujourd'hui 18:00");
    expect(pastMoment(addDays(today, -1), "7:30", today)).toBe("Hier 7:30");
  });

  it("formats times and lengths without dashes", () => {
    expect(addMinutes("18:00", 50)).toBe("18:50");
    expect(addMinutes("23:30", 60)).toBe("0:30");
    expect(timeOf(-30)).toBe("23:30");
    expect(duration(50)).toBe("50 min");
    expect(duration(60)).toBe("1 h");
    expect(duration(80)).toBe("1 h 20");
    expect(duration(215)).toBe("3 h 35");
    expect(span("10:15", "12:15")).toBe("10:15 à 12:15");
    expect(decimal(12.5)).toBe("12,5");
  });

  it("says how long ago", () => {
    const now = new Date("2026-11-16T12:00:00Z");
    expect(ago("2026-11-16T11:59:50Z", now)).toBe("à l'instant");
    expect(ago("2026-11-16T11:48:00Z", now)).toBe("il y a 12 min");
    expect(ago("2026-11-16T09:00:00Z", now)).toBe("il y a 3 h");
    expect(ago("2026-11-13T09:00:00Z", now)).toBe("il y a 3 jours");
  });

  it("joins class names", () => {
    expect(cx("a", false, undefined, "b")).toBe("a b");
  });
});

describe("isoWeek", () => {
  it("names the week of the Thursday, across year ends", () => {
    expect(isoWeek("2026-11-16")).toBe("2026-W47");
    expect(isoWeek("2026-11-22")).toBe("2026-W47");
    expect(isoWeek("2026-12-31")).toBe("2026-W53");
    expect(isoWeek("2027-01-03")).toBe("2026-W53");
    expect(isoWeek("2027-01-04")).toBe("2027-W01");
  });
});
