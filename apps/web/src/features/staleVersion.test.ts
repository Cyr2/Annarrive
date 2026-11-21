import { describe, expect, it } from "vitest";
import { type Probe, recovery } from "./staleVersion.ts";

const base = { moduleFailed: true, online: true, tried: false, waiting: false, probe: "missing" as Probe };

describe("recovery", () => {
  it("lets the waiting version take over when the shell's files are gone", () => {
    expect(recovery({ ...base, waiting: true })).toBe("activate");
    expect(recovery({ ...base, waiting: true, probe: "ok" })).toBe("activate");
  });

  it("clears the service worker when no newer version waits and the file is still missing", () => {
    expect(recovery(base)).toBe("reset");
  });

  it("leaves a blip to Réessayer: the file is there now", () => {
    expect(recovery({ ...base, probe: "ok" })).toBe("none");
  });

  it("never touches anything offline, or when the network does not answer", () => {
    expect(recovery({ ...base, online: false, waiting: true })).toBe("none");
    expect(recovery({ ...base, probe: "unreachable", waiting: true })).toBe("none");
  });

  it("tries once per shell, and only for a module that did not load", () => {
    expect(recovery({ ...base, tried: true, waiting: true })).toBe("none");
    expect(recovery({ ...base, moduleFailed: false })).toBe("none");
  });
});
