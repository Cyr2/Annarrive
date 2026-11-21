import type { Program } from "../../api/schemas.ts";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { useSheet } from "../sheets/store.ts";
import { garminLine, lastRaceLine } from "./program.ts";

/** Two lines: what the row is, and what it holds. */
const Lines = ({ title, detail }: { title: string; detail: string }) => (
  <span className="flex flex-col">
    <span className="t-body">{title}</span>
    <span className="t-sub">{detail}</span>
  </span>
);

/**
 * « Ton niveau »: her last race, which sets her paces (she changes it here), and what her watch says of it, which
 * only informs (no chevron).
 */
export function Level({ program, today }: { program: Program; today: string }) {
  const show = useSheet((s) => s.show);
  const last = program.lastTime;
  return (
    <Section title="Ton niveau">
      <Group>
        <RowButton
          label={
            <Lines title="Ta dernière course" detail={last ? lastRaceLine(last, today) : "Pas encore renseignée"} />
          }
          onClick={() => show({ kind: "lastTime" })}
        />
        <div className="row py-2">
          <Lines title="Ta montre" detail={garminLine(program.garmin)} />
        </div>
      </Group>
    </Section>
  );
}
