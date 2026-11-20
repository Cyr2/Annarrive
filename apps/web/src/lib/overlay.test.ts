import { afterEach, describe, expect, it } from "vitest";
import { lockScroll, movesInside, revealDelta } from "./overlay.ts";

/** happy-dom lays nothing out: a scroller's sizes are set by hand. */
function scroller(scrollTop: number, scrollHeight = 600, clientHeight = 300) {
  const node = document.createElement("div");
  node.style.overflowY = "auto";
  Object.defineProperties(node, {
    scrollHeight: { value: scrollHeight },
    clientHeight: { value: clientHeight },
    scrollTop: { value: scrollTop },
  });
  return node;
}

function touch(target: Element, type: "touchstart" | "touchmove", y: number) {
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: [{ clientX: 100, clientY: y, identifier: 0, target } as unknown as Touch],
  });
  target.dispatchEvent(event);
  return event;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the page under a sheet", () => {
  it("lets a list inside the sheet scroll, both ways while it can", () => {
    const sheet = document.createElement("div");
    const list = scroller(100);
    const row = document.createElement("p");
    list.append(row);
    sheet.append(list);
    document.body.append(sheet);
    expect(movesInside(row, sheet, 0, 40)).toBe(true);
    expect(movesInside(row, sheet, 0, -40)).toBe(true);
  });

  it("stops a move that scrolls nothing inside: from the scrim, the header, a list at its end", () => {
    const sheet = document.createElement("div");
    const header = document.createElement("header");
    const atTop = scroller(0);
    const atEnd = scroller(300);
    const short = scroller(0, 200, 300);
    sheet.append(header, atTop, atEnd, short);
    document.body.append(sheet);
    expect(movesInside(document.body, sheet, 0, -40)).toBe(false);
    expect(movesInside(header, sheet, 0, -40)).toBe(false);
    expect(movesInside(atTop, sheet, 0, 40)).toBe(false);
    expect(movesInside(atEnd, sheet, 0, -40)).toBe(false);
    expect(movesInside(short, sheet, 0, -40)).toBe(false);
  });

  it("leaves a field its own moves (caret, selection)", () => {
    const sheet = document.createElement("div");
    const field = document.createElement("input");
    sheet.append(field);
    expect(movesInside(field, sheet, 30, 0)).toBe(true);
  });

  it("cancels the touch moves that would scroll the page, until the lock ends", () => {
    const sheet = document.createElement("div");
    const list = scroller(100);
    sheet.append(list);
    document.body.append(sheet);
    const unlock = lockScroll(sheet);
    touch(document.body, "touchstart", 300);
    expect(touch(document.body, "touchmove", 200).defaultPrevented).toBe(true);
    touch(list, "touchstart", 300);
    expect(touch(list, "touchmove", 200).defaultPrevented).toBe(false);
    unlock();
    touch(document.body, "touchstart", 300);
    expect(touch(document.body, "touchmove", 200).defaultPrevented).toBe(false);
  });
});

describe("a focused field above the keyboard", () => {
  const view = { top: 100, bottom: 400 };
  it("does not move a field already in sight", () => {
    expect(revealDelta({ top: 200, bottom: 250 }, view)).toBe(0);
  });
  it("scrolls a field under the keyboard just above it, with a margin", () => {
    expect(revealDelta({ top: 450, bottom: 500 }, view)).toBe(116);
  });
  it("scrolls a field above the view back down to it", () => {
    expect(revealDelta({ top: 50, bottom: 100 }, view)).toBe(-66);
  });
  it("keeps the top of a field taller than the view in sight", () => {
    expect(revealDelta({ top: 300, bottom: 800 }, view)).toBe(184);
  });
});
