import { useEffect, useState } from "react";
import type { Api } from "../api/client.ts";
import { api } from "../api/index.ts";

/** Loads something from the server for a sheet; `undefined` while loading, `null` if it failed. */
export function useLoad<T>(load: (api: Api) => Promise<T>, key: string): T | null | undefined {
  const [state, setState] = useState<{ key: string; value: T | null } | undefined>();
  // The key says when to reload; `load` is a new closure on every render.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloads on `key` only, see above
  useEffect(() => {
    let alive = true;
    api()
      .then(load)
      .then(
        (value) => alive && setState({ key, value }),
        () => alive && setState({ key, value: null }),
      );
    return () => {
      alive = false;
    };
  }, [key]);
  return state?.key === key ? state.value : undefined;
}
