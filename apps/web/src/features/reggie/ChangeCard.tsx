import type { ChangeResult } from "../../api/schemas.ts";
import { Button } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { ChangeRows } from "./ChangeRows.tsx";

export type ChangeState = "live" | "undone" | "superseded";

/**
 * After any change Reggie makes: the days before and after, the watch, and Annuler while it is the last change.
 * Undone, the card says so and keeps its rows for the record; once a newer change exists, only that one undoes.
 */
export function ChangeCard({
  change,
  state,
  onUndo,
}: {
  change: ChangeResult;
  state: ChangeState;
  onUndo: () => void;
}) {
  const undone = state === "undone";
  return (
    <Surface
      as="section"
      variant="widget"
      aria-label="Changement de ta semaine"
      className="msg msg-widget flex w-full flex-col gap-3 self-start p-4"
    >
      <div className="flex items-center gap-2">
        <Icon name={undone ? "change" : "checkCircle"} size={18} className="flex-none text-reggie" />
        <span className="t-strong">{undone ? "Changement annulé" : "J'ai modifié ta semaine"}</span>
      </div>
      {change.rows.length > 0 ? (
        <div className={undone ? "opacity-55" : undefined}>
          <ChangeRows rows={change.rows} />
        </div>
      ) : (
        change.message && <p className="t-sub m-0 text-ink">{change.message}</p>
      )}
      <div className="hairline-top flex min-h-11 items-center justify-between gap-2 pt-3">
        <span className="t-cap flex items-center gap-1.5">
          <Icon name="watch" size={16} />
          {undone ? "Montre remise comme avant" : "Ta montre se met à jour"}
        </span>
        {state === "live" && (
          <Button variant="tinted" tone="action" icon="change" onClick={onUndo}>
            Annuler
          </Button>
        )}
      </div>
    </Surface>
  );
}
