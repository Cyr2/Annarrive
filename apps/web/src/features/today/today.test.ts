import { describe, expect, it } from "vitest";
import { frenchSpaces } from "../reggie/Message.tsx";
import { restLine, splitDots } from "./today.ts";

describe("today, details", () => {
  it("keeps the run apart from the other kinds of a day", () => {
    expect(splitDots(["hard", "revision", "class"])).toEqual({ run: "hard", others: ["revision", "class"] });
    expect(splitDots(["class"])).toEqual({ run: undefined, others: ["class"] });
  });

  it("says the same rest line all day and another one the next rest day", () => {
    expect(restLine("2026-11-17")).toBe(restLine("2026-11-17"));
    expect(restLine("2026-11-17")).not.toBe(restLine("2026-11-18"));
  });

  it("keeps French punctuation with its word", () => {
    expect(frenchSpaces("C'est grave ? Oui : non !")).toBe("C'est grave ? Oui : non !");
  });
});
