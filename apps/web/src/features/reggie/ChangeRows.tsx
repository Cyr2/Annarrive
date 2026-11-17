import type { ChangeRow } from "../../api/schemas.ts";
import { SessionChip } from "../../ui/SessionShape.tsx";

/** What the week becomes, day by day, each session in its chip (design/Assistant, change card). */
export function ChangeRows({ rows }: { rows: ChangeRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => (
        <li key={`${row.day}-${row.label}`} className="flex min-w-0 flex-col gap-1">
          <span className="t-cap">{row.day}</span>
          <SessionChip tone={row.tone} className="max-w-full">
            {row.label}
          </SessionChip>
        </li>
      ))}
    </ul>
  );
}
