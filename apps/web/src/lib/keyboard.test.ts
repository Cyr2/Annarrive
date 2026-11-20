import { describe, expect, it } from "vitest";
import { keyboardInset } from "./keyboard.ts";

describe("keyboardInset", () => {
  it("is 0 with no keyboard", () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
  });
  it("is the keyboard and its accessory bar on iOS, where only the visual viewport shrinks", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 0 })).toBe(336);
  });
  it("shrinks as iOS pans the visible part down inside the layout viewport", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 120 })).toBe(216);
    expect(keyboardInset(844, { height: 508, offsetTop: 336 })).toBe(0);
  });
  it("is 0 on Android, where the window shrinks with the keyboard", () => {
    expect(keyboardInset(544, { height: 544, offsetTop: 0 })).toBe(0);
  });
  it("never goes negative on a rubber-band overscroll, and rounds to whole pixels", () => {
    expect(keyboardInset(844, { height: 508, offsetTop: 350 })).toBe(0);
    expect(keyboardInset(844, { height: 507.6, offsetTop: 0 })).toBe(336);
  });
});
