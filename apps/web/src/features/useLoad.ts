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

type Ahead<T> = { promise: Promise<T>; at: number; value?: T };

/** A read started by a finger that then scrolled away is too old to trust after this. */
const AHEAD_MS = 20_000;

/**
 * A sheet's read that can start before the sheet does: on the finger landing on its button, the request
 * leaves while the sheet rises. Each read serves one opening of the sheet, then is forgotten.
 */
export function preloadable<T>(load: (api: Api, id: string) => Promise<T>) {
  const ahead = new Map<string, Ahead<T>>();
  const fresh = (id: string) => {
    const known = ahead.get(id);
    return known && Date.now() - known.at < AHEAD_MS ? known : undefined;
  };
  const start = (id: string): Ahead<T> => {
    const known = fresh(id);
    if (known) return known;
    const entry: Ahead<T> = { promise: api().then((client) => load(client, id)), at: Date.now() };
    entry.promise.then(
      (value) => {
        entry.value = value;
      },
      () => ahead.delete(id),
    );
    ahead.set(id, entry);
    return entry;
  };
  return {
    start,
    /** The read already done, to paint the sheet with it at once. */
    ready: (id: string) => fresh(id)?.value,
    forget: (id: string) => ahead.delete(id),
  };
}

export type Preloadable<T> = ReturnType<typeof preloadable<T>>;

export const moveOptions = preloadable((client, id) => client.moveOptions(id));
export const changeOptions = preloadable((client, id) => client.changeOptions(id));

/** `useLoad` for a preloadable read: the value at once when it is already there. */
export function usePreloaded<T>(loader: Preloadable<T>, id: string): T | null | undefined {
  const [state, setState] = useState<{ id: string; value: T | null } | undefined>(() => {
    const value = loader.ready(id);
    return value === undefined ? undefined : { id, value };
  });
  useEffect(() => {
    let alive = true;
    loader.start(id).promise.then(
      (value) => alive && setState({ id, value }),
      () => alive && setState({ id, value: null }),
    );
    return () => {
      alive = false;
      // The next opening reads again: the plan may have changed in between.
      loader.forget(id);
    };
  }, [loader, id]);
  return state?.id === id ? state.value : undefined;
}
