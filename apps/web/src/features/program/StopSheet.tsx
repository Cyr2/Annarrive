import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";

/** Arrêter ce programme: a confirmation, then maintenance mode. */
export default function StopSheet(sheet: SheetProps<"stop">) {
  const race = usePlan((s) => s.program?.goal.race) ?? "en cours";
  const apply = usePlan((s) => s.apply);
  const stop = async () => {
    if (await apply((api) => api.stopProgram())) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Arrêter le programme"
      footer={
        <Button variant="tinted" tone="danger" size="large" onClick={() => void stop()}>
          Arrêter le programme
        </Button>
      }
    >
      <p className="t-body m-0 px-1">
        Arrêter ton plan {race.toLowerCase()} ? Tu passes en mode entretien : 2 à 3 courses faciles par semaine, dont
        une un peu plus rythmée.
      </p>
    </Sheet>
  );
}
