import type { Item } from "../../api/schemas.ts";
import { SectionTitle } from "../../ui/List.tsx";
import { useSheet } from "../sheets/store.ts";
import { ItemRow } from "../week/WeekItem.tsx";
import { agenda, sheetFor } from "./today.ts";

/**
 * "Ma journée": the day's rows as Semaine draws them, the start time in a column she can scan, each kind told by its
 * style (a run's corner halo, strength's mauve outline, a class's UE pill). Each row opens its own card.
 */
export function DayAgenda({ items, date }: { items: Item[]; date: string }) {
  const show = useSheet((s) => s.show);
  const list = agenda(items, date);
  if (list.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle>Ma journée</SectionTitle>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {list.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              data-crumb="Ligne de la journée"
              onClick={() => show(sheetFor(item))}
              className="press block w-full rounded-row border-0 bg-transparent p-0 text-ink"
            >
              <ItemRow item={item} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
