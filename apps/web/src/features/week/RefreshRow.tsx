import { useEffect } from "react";
import { create } from "zustand";
import { cx } from "../../lib/cx.ts";
import { ago } from "../../lib/date.ts";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { usePlan } from "../plan/store.ts";
import { refreshLine, runsOnly } from "./week.ts";

/** What the timetable's line says: "" before its first read, undefined when the server could not say. */
export function checkedLine(checkedAt: string | undefined, never: string): string {
  if (checkedAt === undefined) return "Injoignable pour l'instant";
  return checkedAt ? `À jour ${ago(checkedAt, new Date())}` : never;
}

/** One read at a time, whether it came from Actualiser or from pulling the page down. */
const useTimetableRead = create<{ reading?: boolean; result?: string; summary?: string }>(() => ({}));

/** Reads the timetable again, then the whole plan on screen. A second call while one runs waits for nothing. */
export async function refreshTimetable() {
  if (useTimetableRead.getState().reading) return;
  useTimetableRead.setState({ reading: true, result: undefined });
  let summary: string | undefined;
  const ok = await usePlan.getState().run(async (client) => {
    summary = (await client.refreshTimetable()).summary;
  });
  useTimetableRead.setState({
    reading: false,
    result: ok ? refreshLine(summary) : undefined,
    summary: ok ? (summary ?? "") : undefined,
  });
}

/**
 * Actualiser, the same everywhere (Aujourd'hui, Semaine, Programme): the button turns and waits while the
 * timetable is read, then the result stays written until she leaves the screen.
 */
export function useTimetableRefresh() {
  const state = useTimetableRead();
  // Leaving the screen forgets the result; a read still on its way finishes.
  useEffect(() => () => useTimetableRead.setState((s) => (s.reading ? s : {})), []);
  const button = (
    <TextButton
      icon="change"
      className={cx("t-label flex-none px-2", state.reading && "week-spin")}
      disabled={state.reading}
      aria-busy={state.reading}
      onClick={() => void refreshTimetable()}
    >
      Actualiser
    </TextButton>
  );
  return { reading: Boolean(state.reading), result: state.result, summary: state.summary, button };
}

/**
 * At the foot of the week: when the timetable was last read, and Actualiser. It reads itself on its own; what such
 * a read did to her runs today stays written here in one short line, and after a manual read its result does.
 */
export function RefreshRow({ checkedAt, change }: { checkedAt?: string; change?: string }) {
  const { reading, result, summary, button } = useTimetableRefresh();
  const line = reading
    ? "Lecture en cours…"
    : summary !== undefined
      ? refreshLine(summary && runsOnly(summary))
      : change
        ? runsOnly(change)
        : checkedLine(checkedAt, "Relu automatiquement plusieurs fois par jour");
  return (
    <Surface variant="inset" className="flex min-h-14 flex-wrap items-center gap-2 py-1 pr-1 pl-4">
      <Icon name={result ? "checkCircle" : "class"} size={18} className="flex-none text-ink-2" />
      <span className="flex min-w-[12ch] flex-1 flex-col py-1.5">
        <span className="t-label text-ink">Emploi du temps</span>
        <span role="status" className="t-cap">
          {line}
        </span>
      </span>
      {button}
    </Surface>
  );
}
