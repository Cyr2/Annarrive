import type { Program } from "../../api/schemas.ts";
import { Dot } from "../../ui/bits.tsx";
import { RowButton } from "../../ui/List.tsx";
import { useSheet } from "../sheets/store.ts";
import { checkedLine, useTimetableRefresh } from "../week/RefreshRow.tsx";

/** "ent.univ.fr": enough to recognize the link without reading it whole. */
const host = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Emploi du temps: when it was last read with Actualiser, and the link she pasted. */
export function TimetableRows({ program }: { program: Program }) {
  const show = useSheet((s) => s.show);
  const { reading, result, button } = useTimetableRefresh();
  const saved = program.timetableUrl ?? "";
  const checkedAt = program.timetableCheckedAt;
  const line = reading ? "Lecture en cours…" : (result ?? checkedLine(checkedAt, "Pas encore lu"));
  return (
    <>
      <div className="row min-h-16">
        <span className="flex min-w-0 flex-col">
          <span className="t-body">Dernière lecture</span>
          <span role="status" className="t-cap flex items-center gap-1.5">
            <Dot size="md" className={checkedAt || result ? "bg-ok" : "bg-warn"} />
            {line}
          </span>
        </span>
        {button}
      </div>
      <RowButton
        label="Lien ICS"
        // A link it cannot read stays on one line, cut short: never a long string across the row.
        value={saved ? <span className="block truncate">{host(saved)}</span> : "Ajouter"}
        onClick={() => show({ kind: "timetable" })}
      />
    </>
  );
}
