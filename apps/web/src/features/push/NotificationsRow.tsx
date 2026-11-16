import { Switch } from "../../ui/Switch.tsx";
import type { PushStatus } from "./push.ts";
import { usePush } from "./store.ts";

const HINTS: Partial<Record<PushStatus, string>> = {
  install: "Sur iPhone, ajoute d'abord Talaria à ton écran d'accueil : Partager, puis Sur l'écran d'accueil.",
  denied: "Refusées : autorise-les dans Réglages, Notifications, Talaria.",
  unsupported: "Ce navigateur ne reçoit pas de notifications.",
};

/** Programme > Notifications: a switch that asks permission on tap, or why it cannot. */
export function NotificationsRow() {
  const { status, busy, toggle } = usePush();
  if (status === "loading" || status === "hidden") return null;
  const hint = HINTS[status];
  return (
    <div className="row min-h-16">
      <span className="flex flex-col">
        <span id="h-push" className="t-body">
          Notifications
        </span>
        {hint && <span className="t-cap">{hint}</span>}
      </span>
      {!hint && (
        <Switch checked={status === "on"} disabled={busy} labelledBy="h-push" onChange={(on) => void toggle(on)} />
      )}
    </div>
  );
}
