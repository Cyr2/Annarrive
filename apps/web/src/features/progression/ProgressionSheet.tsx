import { Group, GroupLabel, Section } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { changeLabel, raceName, weekRows } from "./progression.ts";
import { useProgression } from "./store.ts";

/** Progression's detail: her estimate week by week, then each change of level explained in one line (algo.md PR4). */
export default function ProgressionSheet(sheet: SheetProps<"progression">) {
  const data = useProgression((s) => s.data);
  const today = usePlan((s) => s.today?.date);
  if (!data || !today) return null;
  const rows = weekRows(data, today);
  const race = raceName(data);
  return (
    <Sheet {...sheet} title="Progression" cancelLabel="OK">
      {rows.length > 0 && (
        <Section>
          <GroupLabel>{`Ton ${race.toLowerCase()} estimé, semaine après semaine`}</GroupLabel>
          <Group>
            {rows.map((row, i) => (
              <div key={row.label} className="row">
                <span className="t-body">{row.label}</span>
                <span className={i === 0 ? "t-body font-semibold tabular-nums" : "t-body text-ink-2 tabular-nums"}>
                  {row.value}
                </span>
              </div>
            ))}
          </Group>
        </Section>
      )}
      {data.changes.length > 0 && (
        <Section>
          <GroupLabel>Allures ajustées</GroupLabel>
          <Group>
            {data.changes.map((change) => (
              <div key={change.date} className="row flex-col items-start gap-0.5 py-3">
                <span className="t-body">{changeLabel(change)}</span>
                <span className="t-sub tabular-nums">{change.line}</span>
              </div>
            ))}
          </Group>
        </Section>
      )}
    </Sheet>
  );
}
