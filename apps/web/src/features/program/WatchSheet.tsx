import { ago } from "../../lib/date.ts";
import { Button } from "../../ui/controls.tsx";
import { Group } from "../../ui/List.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";

/** Montre Garmin: model, last sync, Reconnecter. */
export default function WatchSheet(sheet: SheetProps<"watch">) {
  const watch = usePlan((s) => s.program?.watch);
  const run = usePlan((s) => s.run);
  if (!watch) return null;
  const rows = [
    { label: "Modèle", value: watch.model },
    { label: "État", value: watch.connected ? "Connectée" : "Déconnectée" },
  ];
  if (watch.lastSync) rows.push({ label: "Dernière synchro", value: ago(watch.lastSync, new Date()) });
  return (
    <Sheet {...sheet} title="Montre Garmin" cancelLabel="Fermer">
      <Group>
        {rows.map((row) => (
          <div key={row.label} className="row">
            <span className="t-body">{row.label}</span>
            <span className="t-body text-ink-2">{row.value}</span>
          </div>
        ))}
      </Group>
      <p className="t-cap m-0 px-4">Chaque séance est envoyée dans ton calendrier Garmin, donc sur ta montre.</p>
      <Button variant="tinted" size="large" onClick={() => void run((api) => api.reconnectWatch())}>
        Reconnecter
      </Button>
    </Sheet>
  );
}
