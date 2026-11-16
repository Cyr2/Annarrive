import { Button } from "../../ui/Button.tsx";
import { Group } from "../../ui/List.tsx";
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
    <Sheet {...sheet} title="Arrêter le programme">
      <p className="t-body m-0 rounded-group bg-surface p-4">
        Arrêter le programme {race} ? Tu passes en mode entretien : 2 à 3 courses faciles par semaine et une séance de
        qualité.
      </p>
      <Group>
        <Button variant="danger" onClick={() => void stop()}>
          Arrêter le programme
        </Button>
      </Group>
    </Sheet>
  );
}
