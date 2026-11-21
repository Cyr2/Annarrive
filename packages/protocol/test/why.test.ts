import { describe, expect, it } from "vitest";
import { type PlannedSession, sessionWhy } from "../src/index.ts";

type Step = PlannedSession["steps"][number];
const step = (kind: Step["kind"], durMin: number, zone?: Step["zone"], reps?: number): Step => ({
  kind,
  durMin,
  ...(zone ? { zone } : {}),
  ...(reps ? { reps } : {}),
  target: {},
});
const of = (type: PlannedSession["type"], steps: Step[]) => ({
  type,
  steps,
  durMin: steps.reduce((s, st) => s + (st.durMin ?? 0) * (st.reps ?? 1), 0),
});

describe("sessionWhy (B4 of the audit: the why follows what the session holds)", () => {
  it("tells a footing with strides from one with sprints, a short one and a long one", () => {
    const strides = sessionWhy(of("E", [step("work", 40, "E"), step("strides", 1 / 3, "R", 6)]));
    const sprints = sessionWhy(
      of("E", [step("warmup", 15, "E"), step("strides", 1 / 6, "R", 6), step("cooldown", 10, "E")]),
    );
    expect(strides).toContain("accélérations");
    expect(sprints).toContain("10 secondes");
    expect(sessionWhy(of("E", [step("work", 20, "E")]))).toContain("Court exprès");
    expect(sessionWhy(of("E", [step("work", 70, "E")]))).toContain("plus long");
    expect(sessionWhy(of("E", [step("work", 40, "E")]))).toContain("à l'aise");
  });

  it("says a long run with a race-pace or a fast finish is not an easy one", () => {
    expect(sessionWhy(of("L", [step("work", 70, "E"), step("work", 20, "race")]))).toContain("allure de ton objectif");
    expect(sessionWhy(of("L", [step("work", 70, "E"), step("work", 15, "M")]))).toContain("plus vite");
    expect(sessionWhy(of("L", [step("work", 80, "E")]))).toContain("allure facile");
  });

  it("matches the fartlek to the watch, and gives threshold, cruise, intervals and the race week each their own", () => {
    expect(sessionWhy(of("FARTLEK", [step("work", 20, "E"), step("work", 1, "T", 8)]))).toContain("ta montre");
    const lines = (["T", "CRUISE", "I", "SPE", "TEST", "RACE", "RECUP", "R"] as const).map((t) =>
      sessionWhy(of(t, [step("work", 20, "T")])),
    );
    expect(new Set(lines).size).toBe(lines.length);
    expect(sessionWhy(of("SPE", [step("work", 5, "race", 2)]))).toContain("rappels");
    for (const line of lines) expect(line).not.toMatch(/[—–]/);
  });
});
