import { useState } from "react";
import type { Activity, Feel, Run } from "../../api/schemas.ts";
import { addDays, decimal } from "../../lib/date.ts";
import { ChoiceGroup } from "../../ui/ChoiceGroup.tsx";
import { Chip, IconButton } from "../../ui/controls.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { PaceValue } from "../../ui/PaceValue.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { usePlan } from "../plan/store.ts";
import { useChat } from "../reggie/store.ts";
import { useGo } from "../useGo.ts";

const FEELS: { value: Feel; label: string }[] = [
  { value: "easy", label: "Facile" },
  { value: "fine", label: "Correct" },
  { value: "hard", label: "Dur" },
];

/** After the run (design/Apres): planned against done, the feeling if the watch did not ask, a note for Reggie. */
export function AfterRun({ activity, next, today }: { activity: Activity; next?: Run; today: string }) {
  const [note, setNote] = useState("");
  const go = useGo();
  const sendNote = () => {
    if (!note.trim()) return;
    useChat.getState().setContext(`${activity.title}, ce soir`, { screen: "after_run" });
    void useChat.getState().send(note);
    setNote("");
    go("/reggie");
  };
  return (
    <>
      <Surface as="article" className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 flex-none items-center justify-center rounded-full bg-easy-wash text-easy-deep">
            <Icon name="check" size={20} stroke={2.6} />
          </span>
          <div className="flex flex-col">
            <h1 className="t-title">{activity.title}</h1>
            <span className="t-cap">{activity.receivedAt} · reçu de Garmin</span>
          </div>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-2">
          <Figure label="Distance" value={decimal(activity.distanceKm)} unit="km" />
          <Figure label="Durée" value={activity.duration} />
          <Figure label={activity.mainPaceLabel} value={activity.mainPace} />
        </dl>
        <p className="t-body hairline-top m-0 flex items-center gap-2 pt-4">
          <Icon name="checkCircle" size={18} stroke={2.4} className="flex-none text-easy-deep" />
          {activity.verdict}
        </p>
      </Surface>

      {activity.askFeel && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5 px-1">
            <h2 className="t-title">Comment c'était ?</h2>
            <span className="t-cap">Ta montre ne te l'a pas demandé cette fois</span>
          </div>
          <ChoiceGroup label="Comment c'était ?" className="grid grid-cols-3 gap-2">
            {FEELS.map((feel) => (
              <Chip
                key={feel.value}
                selected={activity.feel === feel.value}
                className="w-full"
                onClick={() => void usePlan.getState().run((api) => api.logFeel(activity.id, feel.value))}
              >
                {feel.label}
              </Chip>
            ))}
          </ChoiceGroup>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="note" className="t-title flex items-center gap-2 px-1">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-reggie" />
          Un mot pour Reggie
        </label>
        <Surface variant="inset" className="flex items-end gap-2 p-2">
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Facultatif. Mollet un peu raide sur la fin…"
            className="t-body min-w-0 flex-1 resize-none rounded-xl border-0 bg-transparent p-2 text-ink outline-none"
          />
          <IconButton icon="send" label="Envoyer à Reggie" variant="filled" tone="reggie" onClick={sendNote} />
        </Surface>
      </section>

      <Surface variant="inset" className="flex min-h-14 items-center justify-between px-4">
        <span className="t-sub">Demain</span>
        <span className="t-strong">{next?.date === addDays(today, 1) ? next.title : "Repos"}</span>
      </Surface>
    </>
  );
}

function Figure({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <dt className="t-cap">{label}</dt>
      <dd className="m-0">
        <PaceValue value={value} unit={unit} size="num" />
      </dd>
    </div>
  );
}
