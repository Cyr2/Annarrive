import { afterEach, describe, expect, it, vi } from "vitest";
import { createJobs, type ParisMinute, Scheduler, timetableDue } from "../src/scheduler.ts";

const at = (hour: number, minute: number): ParisMinute => ({ weekday: 1, hour, minute });

describe("timetable schedule", () => {
  it("runs every 20 minutes from 6:00 to 23:00", () => {
    expect([at(6, 0), at(6, 20), at(12, 40), at(22, 40), at(23, 0)].every(timetableDue)).toBe(true);
    expect([at(6, 10), at(23, 20), at(5, 20)].some(timetableDue)).toBe(false);
  });

  it("runs every 2 hours at night", () => {
    expect([at(0, 0), at(2, 0), at(4, 0)].every(timetableDue)).toBe(true);
    expect([at(1, 0), at(3, 0), at(5, 0)].some(timetableDue)).toBe(false);
  });
});

describe("Scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function scheduled(start: string) {
    let now = new Date(start);
    const refreshTimetable = vi.fn();
    const buildNextWeek = vi.fn();
    const scheduler = new Scheduler(createJobs({ refreshTimetable, buildNextWeek }), () => now);
    return { scheduler, refreshTimetable, buildNextWeek, set: (iso: string) => (now = new Date(iso)) };
  }

  it("registers every job of the architecture", () => {
    expect(scheduled("2026-11-16T07:00:00Z").scheduler.jobNames).toEqual([
      "Emploi du temps",
      "Garmin, activités",
      "Garmin, récupération",
      "Décision du matin",
      "Semaine suivante",
      "Montre",
    ]);
  });

  it("runs a due job once per Paris minute", async () => {
    const s = scheduled("2026-11-16T07:20:10Z"); // 08:20 in Paris
    await s.scheduler.tick();
    s.set("2026-11-16T07:20:40Z");
    await s.scheduler.tick();
    s.set("2026-11-16T07:30:00Z");
    await s.scheduler.tick();
    expect(s.refreshTimetable).toHaveBeenCalledTimes(1);
  });

  it("builds next week on Sunday at 18:00 Paris time", async () => {
    const s = scheduled("2026-11-22T17:00:00Z");
    await s.scheduler.tick();
    expect(s.buildNextWeek).toHaveBeenCalledTimes(1);
  });

  it("logs a failing job by name and keeps the others running", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const s = scheduled("2026-11-16T07:20:00Z");
    s.refreshTimetable.mockRejectedValue(new Error("hors ligne"));
    await s.scheduler.tick();
    expect(log).toHaveBeenCalledWith("Tâche « Emploi du temps » en échec : hors ligne");
  });

  it("ticks on an interval until stopped", async () => {
    vi.useFakeTimers();
    const s = scheduled("2026-11-16T07:20:00Z");
    const stop = s.scheduler.start(1000);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(s.refreshTimetable).toHaveBeenCalledTimes(1);
  });
});
