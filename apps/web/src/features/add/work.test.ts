import { describe, expect, it } from "vitest";
import { isValidWork, upcomingMondays, type WorkForm, workEvents } from "./work.ts";

// Thursday 26 November 2026.
const TODAY = "2026-11-26";
const FORM: WorkForm = {
  title: " Coaching ",
  days: [1, 4],
  start: "17:00",
  end: "19:30",
  repeat: "weekly",
  until: "",
  weeks: [],
  legs: true,
};

describe("workEvents", () => {
  it("adds one weekly event per day, a day gone this week starting the next", () => {
    expect(workEvents(FORM, TODAY, TODAY)).toEqual([
      {
        kind: "work",
        title: "Coaching",
        date: "2026-12-01",
        start: "17:00",
        end: "19:30",
        legs: true,
        repeat: "weekly",
      },
      {
        kind: "work",
        title: "Coaching",
        date: "2026-11-27",
        start: "17:00",
        end: "19:30",
        legs: true,
        repeat: "weekly",
      },
    ]);
  });

  it("names untitled work « Travail » and adds it once", () => {
    const [event] = workEvents({ ...FORM, title: "", days: [5], repeat: "once" }, TODAY, TODAY);
    expect(event).toMatchObject({ title: "Travail", date: "2026-11-28", repeat: "never" });
    expect(event?.until).toBeUndefined();
  });

  it("skips the weeks left out of « Certaines semaines »", () => {
    const [m0, m1, m2, m3] = upcomingMondays(TODAY);
    const weeks = [m3, m0, m1].flatMap((m) => (m ? [m] : []));
    const [tuesday, friday] = workEvents({ ...FORM, repeat: "weeks", weeks }, TODAY, TODAY);
    // This week's Tuesday is gone: the series starts on the next one.
    expect(tuesday).toMatchObject({ date: "2026-12-01", until: "2026-12-15", exceptions: ["2026-12-08"] });
    expect(friday).toMatchObject({ date: "2026-11-27", until: "2026-12-18", exceptions: ["2026-12-11"] });
    expect(m2).toBe("2026-12-07");
  });

  it("refuses no day, an end before the start, and a « Jusqu'au » before her first day", () => {
    expect(isValidWork(FORM, TODAY, TODAY)).toBe(true);
    expect(isValidWork({ ...FORM, days: [] }, TODAY, TODAY)).toBe(false);
    expect(isValidWork({ ...FORM, end: "16:00" }, TODAY, TODAY)).toBe(false);
    expect(isValidWork({ ...FORM, until: "2026-11-28" }, TODAY, TODAY)).toBe(false);
    expect(isValidWork({ ...FORM, repeat: "weeks", weeks: [] }, TODAY, TODAY)).toBe(false);
  });
});
