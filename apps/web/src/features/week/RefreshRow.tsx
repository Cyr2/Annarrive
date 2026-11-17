import { useState } from "react";
import { cx } from "../../lib/cx.ts";
import { ago } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { usePlan } from "../plan/store.ts";
import { refreshLine } from "./week.ts";

/**
 * At the foot of the week: when the timetable was last read, and Actualiser. It reads itself on its own, so
 * this stays quiet; after a manual read the result stays written here until she leaves the week.
 */
export function RefreshRow({ checkedAt }: { checkedAt?: string }) {
  const [state, setState] = useState<{ reading?: boolean; result?: string }>({});
  const refresh = async () => {
    setState({ reading: true });
    let summary: string | undefined;
    const ok = await usePlan.getState().run(async (client) => {
      summary = (await client.refreshTimetable()).summary;
    });
    setState({ result: ok ? refreshLine(summary) : undefined });
  };
  const line = state.reading
    ? "Lecture en cours…"
    : (state.result ?? (checkedAt ? `À jour ${ago(checkedAt, new Date())}` : "Se relit tout seul"));
  return (
    <Surface variant="inset" className="flex min-h-14 items-center gap-3 py-1 pr-1 pl-4">
      <Icon name={state.result ? "checkCircle" : "class"} size={18} className="flex-none text-ink-2" />
      <span className="flex min-w-0 flex-1 flex-col py-1.5">
        <span className="t-label text-ink">Emploi du temps</span>
        <span role="status" className="t-cap">
          {line}
        </span>
      </span>
      <TextButton
        icon="change"
        className={cx("t-label flex-none px-3", state.reading && "week-spin")}
        disabled={state.reading}
        onClick={() => void refresh()}
      >
        Actualiser
      </TextButton>
    </Surface>
  );
}
