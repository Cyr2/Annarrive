import { useEffect } from "react";
import { Icon } from "../../ui/Icon.tsx";
import { SectionTitle } from "../../ui/List.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { useSheet } from "../sheets/store.ts";
import { figures } from "./level.ts";
import { useLevel } from "./store.ts";

/** Programme's « Ton niveau » (algo.md M13): three figures on one line; the whole card opens their detail. */
export function LevelCard() {
  const program = usePlan((s) => s.program);
  const data = useLevel((s) => s.data);
  const show = useSheet((s) => s.show);
  // A new chrono or an accepted level reloads the programme: the card follows.
  useEffect(() => {
    if (program) void useLevel.getState().load();
  }, [program]);
  if (!program || data === null) return null;
  return (
    <section aria-labelledby="level-title" className="flex flex-col gap-2">
      <SectionTitle id="level-title">Ton niveau</SectionTitle>
      {data ? (
        <Surface className="relative flex items-center gap-2 py-4 pr-2 pl-5">
          {/* Three columns as wide as their figures: at 320 px each label and figure stays on one line. */}
          <dl className="m-0 flex flex-1 justify-between gap-3 whitespace-nowrap">
            {figures(data).map((f) => (
              <div key={f.label} className="flex flex-none flex-col">
                <dt className="t-cap">{f.label}</dt>
                <dd className="m-0 flex items-baseline gap-1">
                  <span className={f.pending ? "t-sub font-semibold" : "t-strong tabular-nums"}>{f.value}</span>
                  {f.unit && <span className="t-cap">{f.unit}</span>}
                </dd>
              </div>
            ))}
          </dl>
          {/* The whole card opens the detail: the button's box is stretched over it. */}
          <button
            type="button"
            aria-label="Voir le détail de ton niveau"
            onClick={() => show({ kind: "level" })}
            className="flex h-11 w-6 flex-none items-center justify-end bg-transparent p-0 text-ink-3 before:absolute before:inset-0 before:rounded-[inherit] active:before:bg-fill"
          >
            <Icon name="chevronRight" size={16} stroke={2.5} />
          </button>
        </Surface>
      ) : (
        <Skeleton label="Chargement de ton niveau" className="h-[76px]" />
      )}
    </section>
  );
}
