import type { ReactNode } from "react";
import { Icon } from "../../ui/Icon.tsx";
import { Group, SectionTitle } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { chronos, figures, footnote } from "./level.ts";
import { useLevel } from "./store.ts";

/** One line of the sheet: a name and its short source on the left, the figure on the right. */
function Line({ label, detail, children }: { label: ReactNode; detail?: string; children: ReactNode }) {
  return (
    <div className="row py-2.5">
      <span className="flex min-w-0 flex-col">
        <span className="t-body">{label}</span>
        {detail && <span className="t-sub">{detail}</span>}
      </span>
      <span className="t-body flex-none text-right font-semibold tabular-nums">{children}</span>
    </div>
  );
}

/** « Ton niveau » in detail: where each figure comes from, then her possible race times (algo.md M13). */
export default function LevelSheet(sheet: SheetProps<"level">) {
  const data = useLevel((s) => s.data);
  if (!data) return null;
  return (
    <Sheet {...sheet} title="Niveau et chronos" cancelLabel="OK">
      <section aria-labelledby="level-figures" className="flex flex-col gap-2">
        <SectionTitle id="level-figures">Ton niveau</SectionTitle>
        <Group>
          {figures(data).map((f) => (
            <Line key={f.label} label={f.label} detail={f.detail}>
              {f.unit ? `${f.value} ${f.unit}` : f.value}
            </Line>
          ))}
        </Group>
      </section>
      <section aria-labelledby="level-chronos" className="flex flex-col gap-2">
        <SectionTitle id="level-chronos">Tes chronos possibles</SectionTitle>
        <Group>
          {chronos(data).map((c) => (
            <Line
              key={c.label}
              label={
                <span className="inline-flex items-center gap-1.5">
                  {c.label}
                  {c.goal && (
                    <>
                      <Icon name="flag" size={14} className="text-ink-3" />
                      <span className="sr-only-label">, ton objectif</span>
                    </>
                  )}
                </span>
              }
              detail={c.detail}
            >
              {c.value}
              {c.bestCase && <span className="t-sub font-normal"> au mieux</span>}
            </Line>
          ))}
        </Group>
        <p className="t-cap m-0 px-4">{footnote(data)}</p>
      </section>
    </Sheet>
  );
}
