import { workoutRequestSchema } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { toWorkoutRequest, WATCH_GIVE_UP_MS, watchLink, watchStatus, workoutHash } from "../src/garmin/workout.ts";
import { session } from "./helpers.ts";

describe("toWorkoutRequest", () => {
  it("turns an interval session into warmup, a repeat block with its recovery, and cooldown", () => {
    const intervals = session("i", "2026-11-18T18:00", {
      type: "I",
      steps: [
        { kind: "warmup", durMin: 15, target: { hrBpm: [120, 150] } },
        { kind: "work", durMin: 3, reps: 5, target: { paceSKm: [270, 280] } },
        { kind: "recover", durMin: 3, reps: 4, target: { rpe: 2 } },
        { kind: "cooldown", durMin: 10, target: {} },
      ],
    });

    const request = toWorkoutRequest(intervals);

    expect(request).toEqual({
      name: "Fractionné",
      date: "2026-11-18",
      steps: [
        { kind: "warmup", durationS: 900 },
        {
          kind: "repeat",
          iterations: 5,
          steps: [
            { kind: "interval", durationS: 180, pace: { slowMps: 1000 / 280, fastMps: 1000 / 270 } },
            { kind: "recovery", durationS: 180 },
          ],
        },
        { kind: "cooldown", durationS: 600 },
      ],
    });
    expect(workoutRequestSchema.safeParse(request).success).toBe(true);
  });

  it("ends a step at its distance when it has one, and repeats strides without a recovery", () => {
    const request = toWorkoutRequest(
      session("r", "2026-11-19T07:30", {
        type: "R",
        steps: [
          { kind: "work", distM: 400, durMin: 1.5, target: { paceSKm: [230, 220] } },
          { kind: "strides", durMin: 0.25, reps: 6, target: { rpe: 8 } },
        ],
      }),
    );
    expect(request.steps).toEqual([
      { kind: "interval", distanceM: 400, pace: { slowMps: 1000 / 230, fastMps: 1000 / 220 } },
      { kind: "repeat", iterations: 6, steps: [{ kind: "interval", durationS: 15 }] },
    ]);
  });

  it("sends a session without steps as one open run of its duration", () => {
    expect(toWorkoutRequest(session("e", "2026-11-17T18:00", { durMin: 45 }))).toEqual({
      name: "Footing",
      date: "2026-11-17",
      steps: [{ kind: "interval", durationS: 2700 }],
    });
  });

  it("refuses a step the watch could not end", () => {
    const endless = session("x", "2026-11-17T18:00", { steps: [{ kind: "work", target: {} }] });
    expect(() => toWorkoutRequest(endless)).toThrow(/ni distance/);
  });
});

describe("watchStatus", () => {
  const run = session("e", "2026-11-17T18:00");
  const today = "2026-11-16";

  it("is pending until the watch holds this exact content, then tells the last upload's outcome", () => {
    expect(watchStatus(run, undefined, today)).toBe("pending");
    expect(watchStatus(run, { status: "sent", hash: workoutHash(run) }, today)).toBe("sent");
    expect(watchStatus(run, { status: "failed", hash: workoutHash(run) }, today)).toBe("failed");
    expect(watchStatus({ ...run, durMin: 50 }, { status: "sent", hash: workoutHash(run) }, today)).toBe("pending");
  });

  // Without a bridge, or with Garmin down, "Envoi à ta montre…" pulsed for ever (audit robustesse 6).
  it("never stays pending for good: off without a bridge, failed after a long failing spell", () => {
    const now = new Date("2026-11-16T09:00:00Z");
    const since = (minutes: number) => new Date(now.getTime() - minutes * 60_000).toISOString();
    expect(watchLink(false, undefined, now)).toBe("off");
    expect(watchLink(true, undefined, now)).toBe("ok");
    expect(watchLink(true, since(9), now)).toBe("ok");
    expect(watchLink(true, since(WATCH_GIVE_UP_MS / 60_000), now)).toBe("stalled");
    expect(watchStatus(run, undefined, today, "off")).toBe("off");
    expect(watchStatus(run, undefined, today, "stalled")).toBe("failed");
    expect(watchStatus(run, { status: "sent", hash: workoutHash(run) }, today, "stalled")).toBe("sent");
  });

  it("ignores the hour, since the watch calendar only holds the day", () => {
    const later = { ...run, start: "2026-11-17T19:00" };
    expect(watchStatus(later, { status: "sent", hash: workoutHash(run) }, today)).toBe("sent");
  });

  it("has no status outside the 7 days on the watch or once the run is no longer planned", () => {
    expect(watchStatus({ ...run, start: "2026-11-23T18:00" }, undefined, today)).toBeNull();
    expect(watchStatus({ ...run, start: "2026-11-15T18:00" }, undefined, today)).toBeNull();
    expect(watchStatus({ ...run, status: "done" }, undefined, today)).toBeNull();
  });
});
