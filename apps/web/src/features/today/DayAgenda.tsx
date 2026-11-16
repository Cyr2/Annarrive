import type { Item } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { IconTile } from "../../ui/bits.tsx";
import { useSheet } from "../sheets/store.ts";
import { agenda, itemTime, sheetFor, toneOf } from "./today.ts";

/** "Ma journée": classes, revision, the run and strength of the day, each opening its own card. */
export function DayAgenda({ items, date }: { items: Item[]; date: string }) {
  const show = useSheet((s) => s.show);
  const list = agenda(items, date);
  if (list.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="t-title px-1">Ma journée</h2>
      <ul className="m-0 list-none rounded-group bg-surface px-0 py-1">
        {list.map((item, index) => {
          const cancelled = "cancelled" in item && item.cancelled;
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => show(sheetFor(item))}
                className="flex w-full items-center gap-3 border-0 bg-transparent px-4 text-left text-text"
              >
                <IconTile tone={toneOf(item)} />
                <span
                  className={cx(
                    "flex min-h-15 flex-1 flex-col justify-center",
                    index < list.length - 1 && "border-b-[0.5px] border-hairline",
                  )}
                >
                  <span
                    className={cx(item.kind === "run" ? "t-strong" : "t-body", cancelled && "line-through opacity-60")}
                  >
                    {item.title}
                  </span>
                  <span className="t-cap">{cancelled ? "N'a pas lieu" : itemTime(item)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
