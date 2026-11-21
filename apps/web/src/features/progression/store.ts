import { create } from "zustand";
import { api } from "../../api/index.ts";
import type { Data } from "./progression.ts";

/** The block and its sheet read the same answer: `undefined` while it comes, null when there is none or it failed. */
export const useProgression = create<{ data?: Data | null; load: () => Promise<void> }>((set) => ({
  async load() {
    try {
      set({ data: await (await api()).progression() });
    } catch {
      set({ data: null });
    }
  },
}));
