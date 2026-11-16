import { useState } from "react";
import { Button } from "../../ui/Button.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { AskReggie } from "../reggie/AskReggie.tsx";
import type { SheetProps } from "../sheets/SheetHost.tsx";
import { useSheet } from "../sheets/store.ts";
import { sessionContext } from "../today/today.ts";
import { Summary } from "./Summary.tsx";
import { FeverStep, PainStep, ReasonStep, ZoneStep } from "./steps.tsx";
import { canContinue, type Draft, EMPTY, nextStep, type Step, toInput } from "./unavailable.ts";

/** Pas dispo (design/PasDispo): one question at a time, a summary of what changes, then Valider. */
export default function UnavailableSheet({ spec, ...sheet }: SheetProps<"unavailable">) {
  const plan = usePlan();
  const show = useSheet((s) => s.show);
  const [step, setStep] = useState<Step>("reason");
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const run = findRun(plan, spec.id);
  if (!run) return null;
  const today = todayOf(plan);
  const input = toInput(draft, run.id);
  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const next = () => {
    const target = nextStep(step, draft);
    if (target === "move") show({ kind: "move", id: run.id });
    else if (target !== "reggie") setStep(target);
  };
  const validate = async () => {
    if (input && (await plan.apply((api) => api.unavailable(input)))) sheet.onOpenChange(false);
  };

  return (
    <Sheet {...sheet} title="Pas dispo">
      {step === "reason" && <ReasonStep draft={draft} today={today} onChange={update} />}
      {step === "fever" && <FeverStep fever={draft.fever} onChange={(fever) => update({ fever })} />}
      {step === "zone" && <ZoneStep zone={draft.zone} onChange={(zone) => update({ zone })} />}
      {step === "pain" && <PainStep pain={draft.pain} zone={draft.zone} onChange={(pain) => update({ pain })} />}
      {step === "summary" && input && <Summary input={input} />}

      {step === "reason" && draft.reason === "other" ? (
        <AskReggie
          context={`Pas dispo · ${sessionContext(run, today)}`}
          label="Explique à Reggie"
          placeholder="Ce qui se passe"
          onSent={() => sheet.onOpenChange(false)}
        />
      ) : step === "summary" ? (
        <Button disabled={!input} onClick={() => void validate()}>
          Valider
        </Button>
      ) : (
        <Button disabled={!canContinue(step, draft)} onClick={next}>
          Continuer
        </Button>
      )}
    </Sheet>
  );
}
