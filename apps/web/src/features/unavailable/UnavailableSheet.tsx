import { useState } from "react";
import { Button } from "../../ui/controls.tsx";
import { Sheet } from "../../ui/Sheet.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { findRun, todayOf } from "../plan/selectors.ts";
import { usePlan } from "../plan/store.ts";
import { AskReggie } from "../reggie/AskReggie.tsx";
import { preloadSheet, type SheetProps } from "../sheets/SheetHost.tsx";
import { useSheet } from "../sheets/store.ts";
import { sessionContext } from "../today/today.ts";
import { moveOptions } from "../useLoad.ts";
import { Summary } from "./Summary.tsx";
import { FeverStep, PainStep, ReasonStep, ZoneStep } from "./steps.tsx";
import { canContinue, type Draft, EMPTY, nextStep, progressOf, type Step, toInput } from "./unavailable.ts";

/** Pas dispo (design/PasDispo): one question at a time, a summary of what changes, then Valider. */
export default function UnavailableSheet({ spec, ...sheet }: SheetProps<"unavailable">) {
  const plan = usePlan();
  const replace = useSheet((s) => s.replace);
  // The steps she went through, so the chevron can take her back one.
  const [trail, setTrail] = useState<Step[]>(["reason"]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const run = findRun(plan, spec.id);
  if (!run) return null;
  const step = trail.at(-1) ?? "reason";
  const today = todayOf(plan);
  const input = toInput(draft, run.id);
  const update = (patch: Partial<Draft>) => {
    // "Pas le temps" leads to Déplacer: its file and its slots leave now, so it is ready on Continuer.
    if (patch.reason === "time") {
      preloadSheet("move");
      moveOptions.start(run.id);
    }
    setDraft({ ...draft, ...patch });
  };

  const next = () => {
    const target = nextStep(step, draft);
    if (target === "move") replace({ kind: "move", id: run.id });
    else if (target !== "reggie") setTrail([...trail, target]);
  };
  const validate = async () => {
    if (input && (await plan.apply((api) => api.unavailable(input)))) sheet.onOpenChange(false);
  };
  const feelBetter = async () => {
    if (await plan.apply((api) => api.feelBetter())) sheet.onOpenChange(false);
  };
  const toReggie = step === "reason" && draft.reason === "other";
  // A closed question answers itself on tap, as Reggie's do.
  const pickFever = (fever: boolean) => {
    setDraft({ ...draft, fever });
    setTrail([...trail, "summary"]);
  };

  return (
    <Sheet
      {...sheet}
      title="Pas dispo"
      subtitle={progressOf(step, draft)}
      onBack={trail.length > 1 ? () => setTrail(trail.slice(0, -1)) : undefined}
      footer={
        toReggie || step === "fever" ? undefined : (
          <>
            {step === "summary" ? (
              <Button variant="filled" size="large" disabled={!input} onClick={() => void validate()}>
                Valider
              </Button>
            ) : (
              <Button variant="filled" size="large" disabled={!canContinue(step, draft)} onClick={next}>
                Continuer
              </Button>
            )}
            {step === "reason" && plan.today?.unwell && (
              <TextButton onClick={() => void feelBetter()}>Ça va mieux</TextButton>
            )}
          </>
        )
      }
    >
      {step === "reason" && <ReasonStep draft={draft} today={today} onChange={update} />}
      {step === "fever" && <FeverStep fever={draft.fever} onPick={pickFever} />}
      {step === "zone" && <ZoneStep zone={draft.zone} onChange={(zone) => update({ zone })} />}
      {step === "pain" && <PainStep pain={draft.pain} zone={draft.zone} onChange={(pain) => update({ pain })} />}
      {step === "summary" && input && <Summary input={input} />}
      {toReggie && (
        <AskReggie
          context={`Pas dispo · ${sessionContext(run, today)}`}
          sessionId={run.id}
          label="Explique à Reggie"
          placeholder="Ce qui se passe"
          onSent={() => sheet.onOpenChange(false)}
        />
      )}
    </Sheet>
  );
}
