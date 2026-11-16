import type { ChangeRow } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { TONES } from "../../ui/tones.ts";

/** Before and after, day by day, in the color of each session (design/Assistant, change card). */
export function ChangeRows({ rows }: { rows: ChangeRow[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {rows.map((row) => {
        const tone = TONES[row.tone];
        return (
          <li key={`${row.day}-${row.label}`} className={cx("flex items-center gap-3 rounded-xl px-3 py-2", tone.wash)}>
            <span className={cx("t-cap w-14 flex-none", tone.ink)}>{row.day}</span>
            <span className={cx("t-strong flex-1", tone.deep)}>{row.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
