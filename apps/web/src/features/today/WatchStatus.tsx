import type { Run } from "../../api/schemas.ts";
import { cx } from "../../lib/cx.ts";
import { Icon } from "../../ui/Icon.tsx";
import { usePlan } from "../plan/store.ts";
import { WATCH_LABEL } from "./today.ts";

/**
 * Where the session stands on her watch. Sent: a quiet line. Sending: the same, breathing. Failed: a calm amber
 * pill whose "Réessayer" (the action blue) sends it again.
 */
export function WatchStatus({ run, className }: { run: Run; className?: string }) {
  if (!run.watch) return null;
  if (run.watch !== "failed") {
    return (
      <span className={cx("t-cap flex min-h-11 items-center gap-1.5", className)}>
        <Icon name="watch" size={16} className={run.watch === "sending" ? "motion-safe:animate-pulse" : undefined} />
        {WATCH_LABEL[run.watch]}
      </span>
    );
  }
  return (
    <button
      type="button"
      aria-label="Pas envoyée sur ta montre. Réessayer"
      onClick={() => void usePlan.getState().run((api) => api.resendToWatch(run.id))}
      className={cx(
        "press t-cap flex min-h-11 items-center gap-1.5 rounded-full border-0 bg-warn-wash px-3 text-warn-deep",
        className,
      )}
    >
      <Icon name="watch" size={16} />
      Pas envoyée
      <span className="font-semibold text-action">Réessayer</span>
    </button>
  );
}
