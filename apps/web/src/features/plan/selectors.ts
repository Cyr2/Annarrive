import type { Item, Run } from "../../api/schemas.ts";
import { toIso } from "../../lib/date.ts";
import type { PlanState } from "./store.ts";

/** Finds an item in today's session or any loaded week. */
export function findItem(state: Pick<PlanState, "today" | "weeks">, id: string): Item | undefined {
  if (state.today?.session?.id === id) return state.today.session;
  for (const week of Object.values(state.weeks)) {
    const item = week.items.find((i) => i.id === id);
    if (item) return item;
  }
  return undefined;
}

export function findRun(state: Pick<PlanState, "today" | "weeks">, id: string): Run | undefined {
  const item = findItem(state, id);
  return item?.kind === "run" ? item : undefined;
}

/** Today's date as the server sees it, falling back to the device clock before the first load. */
export function todayOf(state: Pick<PlanState, "today">): string {
  return state.today?.date ?? toIso(new Date());
}
