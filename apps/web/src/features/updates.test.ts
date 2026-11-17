import { describe, expect, it, vi } from "vitest";
import { useSheet } from "./sheets/store.ts";
import { watchForUpdates } from "./updates.ts";

const pwa: { needRefresh?: () => void; update: (reload?: boolean) => Promise<void> } = {
  update: vi.fn(async () => undefined),
};
const registerSW: Parameters<typeof watchForUpdates>[0] = (options) => {
  pwa.needRefresh = options?.onNeedRefresh;
  return pwa.update;
};
const toast = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock("../ui/toast.ts", () => toast);

describe("watchForUpdates", () => {
  it("offers the new version only once no sheet is up, and reloads on Recharger", async () => {
    vi.useFakeTimers();
    watchForUpdates(registerSW);
    useSheet.getState().show({ kind: "goal" });
    pwa.needRefresh?.();
    expect(toast.notify).not.toHaveBeenCalled();

    useSheet.getState().close();
    vi.runAllTimers();
    expect(toast.notify).toHaveBeenCalledOnce();
    const [message, action] = toast.notify.mock.lastCall ?? [];
    expect(message).toBe("Nouvelle version prête");
    action.onClick();
    expect(pwa.update).toHaveBeenCalledWith(true);
    vi.useRealTimers();
  });
});
