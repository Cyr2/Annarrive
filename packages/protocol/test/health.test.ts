import { describe, expect, it } from "vitest";
import { healthSchema } from "../src/index.ts";

describe("healthSchema", () => {
  it("accepts the server's health answer", () => {
    expect(healthSchema.parse({ status: "ok", version: "0.1.0" })).toEqual({ status: "ok", version: "0.1.0" });
  });

  it("rejects anything else", () => {
    expect(() => healthSchema.parse({ status: "down" })).toThrow();
  });
});
