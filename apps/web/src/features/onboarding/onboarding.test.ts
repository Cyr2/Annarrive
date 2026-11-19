import { IMPLAUSIBLE_TIME } from "@annarrive/protocol";
import { describe, expect, it } from "vitest";
import { declaredTimeOf, EMPTY, feasibilityInput, issue, toPayload } from "./onboarding.ts";

describe("« Ton dernier chrono »", () => {
  const today = "2026-11-18";

  it("sends nothing when she skips it", () => {
    expect(declaredTimeOf(EMPTY, today)).toBeUndefined();
    expect(toPayload({ ...EMPTY, race: "none" }, today).program).toEqual({ goal: null });
  });

  it("dates a recent time roughly, and leaves an estimate undated", () => {
    const draft = { ...EMPTY, lastSec: 110 * 60 };
    expect(declaredTimeOf(draft, today)).toEqual({ distanceM: 21097.5, minutes: 110, date: "2026-10-04" });
    expect(declaredTimeOf({ ...draft, lastWhen: "estimate" }, today)).toEqual({ distanceM: 21097.5, minutes: 110 });
  });

  it("feeds the level estimate of the programme and of the target's verdict", () => {
    const draft = { ...EMPTY, race: 10000 as const, date: "2027-03-14", targetSec: 52 * 60, lastSec: 55 * 60 };
    expect(toPayload(draft, today).program.declaredTime).toMatchObject({ minutes: 55 });
    expect(feasibilityInput(draft, today)?.declaredTime).toMatchObject({ minutes: 55 });
  });

  // Audit robustesse-2, 12: 0 h 05 for a half marathon went through.
  it("holds back a time no one runs on that distance", () => {
    expect(issue("last", { ...EMPTY, lastSec: 5 * 60 }, today)).toBe(IMPLAUSIBLE_TIME);
    expect(issue("last", { ...EMPTY, lastSec: 110 * 60 }, today)).toBeUndefined();
    expect(issue("last", EMPTY, today)).toBeUndefined();
  });
});
