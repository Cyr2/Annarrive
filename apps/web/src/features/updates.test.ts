import { describe, expect, it, vi } from "vitest";
import { useSheet } from "./sheets/store.ts";
import { watchForUpdates } from "./updates.ts";

const pwa: {
  needRefresh?: () => void;
  registered?: (registration: ServiceWorkerRegistration) => void;
  update: (reload?: boolean) => Promise<void>;
} = { update: vi.fn(async () => undefined) };
const registerSW: Parameters<typeof watchForUpdates>[0] = (options) => {
  pwa.needRefresh = options?.onNeedRefresh;
  pwa.registered = (registration) => options?.onRegisteredSW?.("/sw.js", registration);
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
    // The reloaded page skips the launch animation (index.html).
    expect(sessionStorage.getItem("splash-skip")).toBe("1");
    vi.useRealTimers();
  });

  it("offers the waiting version again when she comes back after swiping the banner away", () => {
    toast.notify.mockClear();
    watchForUpdates(registerSW);
    const registration = { waiting: {}, update: vi.fn(async () => undefined) };
    pwa.registered?.(registration as unknown as ServiceWorkerRegistration);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(toast.notify).toHaveBeenCalledOnce();
    expect(toast.notify.mock.lastCall?.[3]).toBe("update");
  });
});
