import type { ChangeRow } from "../../api/schemas.ts";
import { SessionChip } from "../../ui/SessionShape.tsx";

/**
 * What the week becomes, day by day: the day, what it had struck through in the faint ink, then the new
 * session in its chip. A row without a before only says what it becomes (advice, a dry run).
 */
export function ChangeRows({ rows }: { rows: ChangeRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {rows.map((row) => (
        <li
          key={`${row.day}-${row.label}`}
          className="flex min-w-0 flex-col gap-1 py-2.5 not-first:border-t-[0.5px] not-first:border-hairline"
        >
          <span className="t-cap font-semibold text-ink">{row.day}</span>
          {row.before && (
            <span className="t-cap truncate text-ink-2 line-through decoration-ink-3">
              <span className="sr-only-label">Avant :</span>
              {row.before}
            </span>
          )}
          <SessionChip tone={row.tone} className="max-w-full">
            {row.before && <span className="sr-only-label">Après :</span>}
            {row.label}
          </SessionChip>
        </li>
      ))}
    </ul>
  );
}
