import { beforeEach, expect, it } from "vitest";
import { signOut, useSignedOut } from "./session.ts";

beforeEach(() => localStorage.clear());

it("signing out forgets what the app kept on the phone, and only that", () => {
  localStorage.setItem("annarrive.firstScreen", "{}");
  localStorage.setItem("annarrive-incidents", "[]");
  localStorage.setItem("other", "keep");
  signOut();
  expect(localStorage.getItem("annarrive.firstScreen")).toBeNull();
  expect(localStorage.getItem("annarrive-incidents")).toBeNull();
  expect(localStorage.getItem("other")).toBe("keep");
  expect(useSignedOut.getState().signedOut).toBe(true);
});
