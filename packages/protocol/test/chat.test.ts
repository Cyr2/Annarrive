import { describe, expect, it } from "vitest";
import {
  CHAT_TEXT_MAX,
  chatRequestSchema,
  chatStreamEventSchema,
  chatWidgetSchema,
  unavailableSchema,
} from "../src/index.ts";

describe("chat schemas", () => {
  it("trims a message and refuses an empty one", () => {
    expect(chatRequestSchema.parse({ text: "  Salut ", context: { screen: "today" } }).text).toBe("Salut");
    expect(chatRequestSchema.safeParse({ text: "   " }).success).toBe(false);
    // Audit robustesse-2, 5: our own words for a message too long, not zod's.
    const long = chatRequestSchema.safeParse({ text: "a".repeat(CHAT_TEXT_MAX + 1) });
    expect(long.error?.issues[0]?.message).toMatch(/^Ton message dépasse/);
  });

  it("keeps reply buttons between 2 and 5 and the slider on 0 to 10", () => {
    expect(chatWidgetSchema.safeParse({ type: "choices", options: ["Oui"] }).success).toBe(false);
    expect(chatWidgetSchema.safeParse({ type: "choices", options: ["Oui", "Non"] }).success).toBe(true);
    expect(chatWidgetSchema.safeParse({ type: "slider", label: "Douleur", min: 0, max: 5 }).success).toBe(false);
  });

  it("types each stream event", () => {
    expect(chatStreamEventSchema.parse({ type: "text", delta: "Ok" })).toEqual({ type: "text", delta: "Ok" });
    expect(chatStreamEventSchema.safeParse({ type: "widget", widget: { type: "checking" } }).success).toBe(true);
    expect(chatStreamEventSchema.safeParse({ type: "text" }).success).toBe(false);
  });
});

describe("Pas dispo", () => {
  it("needs the follow-up answer of each reason", () => {
    expect(unavailableSchema.safeParse({ reason: "sick" }).success).toBe(false);
    expect(unavailableSchema.parse({ reason: "pain", where: "genou", walking0to10: 2, until: "2026-11-20" })).toEqual({
      reason: "pain",
      where: "genou",
      walking0to10: 2,
      until: "2026-11-20",
    });
  });
});
