import { describe, expect, it } from "vitest";
import { paceLabel, stepBlocks } from "../src/index.ts";

describe("paceLabel", () => {
  it("writes the runner's notation with the unit, one value or a range", () => {
    expect(paceLabel(346)).toBe("5'46\u00a0/km");
    expect(paceLabel([473, 397])).toBe("6'37 à 7'53\u00a0/km");
    expect(paceLabel([299.6, 300.2])).toBe("5'00\u00a0/km");
  });
});

describe("stepBlocks", () => {
  it("groups a repeated step with the recovery after it, as a Garmin repeat", () => {
    const steps = [
      { kind: "warmup" },
      { kind: "work", reps: 3 },
      { kind: "recover", reps: 2 },
      { kind: "strides", reps: 6 },
      { kind: "cooldown" },
    ];
    expect(stepBlocks(steps)).toEqual([
      { kind: "step", step: steps[0] },
      { kind: "repeat", times: 3, steps: [steps[1], steps[2]] },
      { kind: "repeat", times: 6, steps: [steps[3]] },
      { kind: "step", step: steps[4] },
    ]);
  });
});
