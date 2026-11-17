import { PRIVACY_NOTE } from "../../lib/privacy.ts";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { usePlan } from "../plan/store.ts";
import type { SheetProps } from "../sheets/SheetHost.tsx";

/** Turning the cycle on asks for her consent first, and says what the app will and will not do. */
export default function CycleSheet(sheet: SheetProps<"cycle">) {
  const apply = usePlan((s) => s.apply);
  const agree = async () => {
    if (await apply((api) => api.updateSettings({ cycle: true }), { quiet: true })) sheet.onOpenChange(false);
  };
  return (
    <Sheet
      {...sheet}
      title="Cycle menstruel"
      footer={
        <>
          <Button variant="filled" size="large" onClick={() => void agree()}>
            J'accepte et j'active
          </Button>
          <TextButton onClick={() => sheet.onOpenChange(false)}>Pas maintenant</TextButton>
        </>
      }
    >
      <Surface variant="inset" className="t-body flex flex-col gap-3 p-4">
        <p className="m-0">
          Si tu l'actives, tu peux signaler à Reggie un symptôme lié à ton cycle (douleurs, fatigue). Il en tient compte
          comme pour toute fatigue.
        </p>
        <p className="m-0">
          L'app ne change jamais tes séances selon la phase de ton cycle. Tu peux désactiver ce réglage à tout moment.
        </p>
        <p className="m-0">{PRIVACY_NOTE}</p>
      </Surface>
    </Sheet>
  );
}
