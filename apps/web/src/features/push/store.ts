import { create } from "zustand";
import type { Api } from "../../api/client.ts";
import { errorMessage } from "../../api/errors.ts";
import { api as defaultApi } from "../../api/index.ts";
import { notify as defaultNotify } from "../../ui/toast.ts";
import { browserEnv, checkPush, disablePush, enablePush, type PushEnv, type PushStatus } from "./push.ts";

export type PushState = {
  /** `loading` until the start check answers; the switch stays hidden meanwhile. */
  status: PushStatus | "loading";
  key: string | null;
  busy: boolean;
  check: () => Promise<void>;
  /** Only ever called from a tap on the switch. */
  toggle: (on: boolean) => Promise<void>;
};

export function createPushStore(getApi: () => Promise<Api>, env: () => PushEnv, notify: (message: string) => void) {
  return create<PushState>((set, get) => ({
    status: "loading",
    key: null,
    busy: false,
    async check() {
      try {
        set(await checkPush(await getApi(), env()));
      } catch {
        // Notifications are a bonus: when the check fails, the switch simply stays hidden until the next start.
        set({ status: "loading" });
      }
    },
    async toggle(on) {
      const { key } = get();
      // Asked before any await, while the tap still counts as a user gesture.
      const asked = on ? env().requestPermission() : undefined;
      set({ busy: true });
      try {
        const api = await getApi();
        const status = asked && key ? await enablePush(api, env(), key, asked) : await disablePush(api, env());
        set({ status });
      } catch (error) {
        notify(errorMessage(error));
      } finally {
        set({ busy: false });
      }
    },
  }));
}

export const usePush = createPushStore(defaultApi, browserEnv, (message) => void defaultNotify(message));
