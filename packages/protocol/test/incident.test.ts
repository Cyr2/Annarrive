import { describe, expect, it } from "vitest";
import { incidentBatchSchema, redact } from "../src/index.ts";

const device = {
  userAgent: "iPhone",
  viewport: "390x844",
  standalone: true,
  os: "ios",
  version: "app-abc.js",
  timezone: "Europe/Paris",
  online: true,
} as const;
const incident = { type: "error", message: "boom", at: "2026-11-18T19:00:00Z", route: "/", breadcrumbs: [], device };

describe("redact", () => {
  it("drops query strings, e-mails and long tokens, keeps the rest", () => {
    expect(redact("GET /api/auth/login?token=abc123 failed")).toBe("GET /api/auth/login?… failed");
    expect(redact("from anna.k@example.fr")).toBe("from [e-mail]");
    expect(redact(`cookie ${"A".repeat(43)} end`)).toBe("cookie [secret] end");
    expect(redact("Bearer eyJhbGciOi.eyJzdWIi.c2lnbmF0dXJl")).toBe("Bearer [secret]");
    expect(redact("Ça va ? at app-B3x9.js:1:20 /sessions/s-2026-11-18/move")).toBe(
      "Ça va ? at app-B3x9.js:1:20 /sessions/s-2026-11-18/move",
    );
  });
});

describe("incident batch", () => {
  it("accepts up to five incidents and caps their sizes", () => {
    expect(incidentBatchSchema.safeParse({ incidents: [incident] }).success).toBe(true);
    expect(incidentBatchSchema.safeParse({ incidents: Array(6).fill(incident) }).success).toBe(false);
    expect(incidentBatchSchema.safeParse({ incidents: [{ ...incident, message: "x".repeat(1001) }] }).success).toBe(
      false,
    );
    const crumb = { at: "t", kind: "tap", label: "Déplacer" };
    expect(
      incidentBatchSchema.safeParse({ incidents: [{ ...incident, breadcrumbs: Array(51).fill(crumb) }] }).success,
    ).toBe(false);
    expect(incidentBatchSchema.safeParse({ incidents: [{ ...incident, type: "server" }] }).success).toBe(false);
  });
});
