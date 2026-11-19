import { describe, expect, it, vi } from "vitest";
import { createMockApi } from "../../api/mock/index.ts";
import { checkPush, keyBytes, type PushEnv } from "./push.ts";
import { createPushStore } from "./store.ts";

const KEY = "BAQD_w";

function fakeEnv(over: Partial<PushEnv> = {}, held = false) {
  const subscription = {
    endpoint: "https://web.push.apple.com/x",
    toJSON: () => ({ endpoint: "https://web.push.apple.com/x", keys: { p256dh: "p", auth: "a" } }),
    unsubscribe: vi.fn(async () => true),
  };
  const manager = {
    getSubscription: vi.fn(async () => (held ? subscription : null)),
    subscribe: vi.fn(async () => subscription),
  };
  const env: PushEnv = {
    supported: true,
    ios: true,
    standalone: true,
    permission: () => "granted",
    requestPermission: vi.fn(async () => "granted" as const),
    manager: async () => manager,
    ...over,
  };
  return { env, manager, subscription };
}

function fakeApi(key: string | null = KEY) {
  const api = createMockApi();
  return {
    ...api,
    pushKey: vi.fn(async () => key),
    subscribePush: vi.fn(async () => undefined),
    unsubscribePush: vi.fn(async () => undefined),
  };
}

describe("push subscription", () => {
  it("decodes the base64url VAPID key", () => {
    expect([...keyBytes(KEY)]).toEqual([4, 4, 3, 255]);
  });

  it("asks an iPhone to install the app first, and hides the switch without a server key", async () => {
    expect((await checkPush(fakeApi(), fakeEnv({ standalone: false, supported: false }).env)).status).toBe("install");
    expect((await checkPush(fakeApi(), fakeEnv({ ios: false, supported: false }).env)).status).toBe("unsupported");
    expect((await checkPush(fakeApi(null), fakeEnv().env)).status).toBe("hidden");
    expect((await checkPush(fakeApi(), fakeEnv({ permission: () => "denied" }).env)).status).toBe("denied");
    expect((await checkPush(fakeApi(), fakeEnv({ permission: () => "default" }).env)).status).toBe("off");
  });

  it("sends the held subscription again at each start", async () => {
    const api = fakeApi();
    expect(await checkPush(api, fakeEnv({}, true).env)).toEqual({ status: "on", key: KEY });
    expect(api.subscribePush).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "https://web.push.apple.com/x" }),
    );
  });

  it("asks permission on the tap, subscribes with the server key, then unsubscribes", async () => {
    const api = fakeApi();
    const { env, manager, subscription } = fakeEnv({ permission: () => "default" });
    const push = createPushStore(
      async () => api,
      () => env,
      vi.fn(),
    );
    await push.getState().check();
    expect(push.getState().status).toBe("off");
    expect(env.requestPermission).not.toHaveBeenCalled();

    await push.getState().toggle(true);
    expect(env.requestPermission).toHaveBeenCalledTimes(1);
    expect(manager.subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: keyBytes(KEY) });
    expect(api.subscribePush).toHaveBeenCalled();
    expect(push.getState()).toMatchObject({ status: "on", busy: false });

    manager.getSubscription.mockResolvedValue(subscription);
    await push.getState().toggle(false);
    expect(api.unsubscribePush).toHaveBeenCalledWith("https://web.push.apple.com/x");
    expect(subscription.unsubscribe).toHaveBeenCalled();
    expect(push.getState().status).toBe("off");
  });

  it("says when she refuses, and when the server fails", async () => {
    const api = fakeApi();
    const notify = vi.fn();
    const refused = fakeEnv({ requestPermission: async () => "denied" }).env;
    const push = createPushStore(
      async () => api,
      () => refused,
      notify,
    );
    await push.getState().check();
    await push.getState().toggle(true);
    expect(push.getState().status).toBe("denied");

    api.subscribePush.mockRejectedValue(new Error("hors ligne"));
    const held = fakeEnv({}, true).env;
    const failing = createPushStore(
      async () => api,
      () => held,
      notify,
    );
    await failing.getState().check();
    expect(failing.getState().status).toBe("loading");
    api.subscribePush.mockResolvedValue(undefined);
    await failing.getState().check();
    api.subscribePush.mockRejectedValue(new Error("hors ligne"));
    await failing.getState().toggle(true);
    expect(notify).toHaveBeenCalledWith("Ça n'a pas marché. Réessaie dans un instant.");
  });
});
