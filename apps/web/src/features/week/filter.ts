import { useState } from "react";
import { z } from "zod";
import type { Filter } from "./week.ts";

const KEY = "annarrive.week-filter";
const filterSchema: z.ZodType<Filter> = z.enum(["all", "run", "strength", "class", "revision"]);

/** The kind she chose to see last time, on this phone; Tout if none, or if the browser keeps nothing. */
export function storedFilter(): Filter {
  try {
    const parsed = filterSchema.safeParse(localStorage.getItem(KEY));
    return parsed.success ? parsed.data : "all";
  } catch {
    return "all";
  }
}

/** Semaine's filter, kept across visits so the week opens as she left it. */
export function useWeekFilter() {
  const [filter, setFilter] = useState(storedFilter);
  const choose = (next: Filter) => {
    setFilter(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode: the choice lasts until the screen closes.
    }
  };
  return [filter, choose] as const;
}
