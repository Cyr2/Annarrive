import { useState } from "react";
import type { Activity, Feel, Run } from "../../api/schemas.ts";
import { addDays } from "../../lib/date.ts";
import { Glass } from "../../ui/Glass.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Segmented } from "../../ui/Segmented.tsx";
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
    useChat.getState().setContext(`${activity.title}, ce soir`);
    void useChat.getState().send(note);
    setNote("");
    go("/reggie");
  };
  return (
    <>
      <Glass as="article" className="flex flex-col gap-4 rounded-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 flex-none items-center justify-center rounded-full bg-intense text-on-accent">
            <Icon name="check" size={20} stroke={2.6} />
          </span>
          <div className="flex flex-col">
            <h1 className="t-title">{activity.title}</h1>
            <span className="t-cap">{activity.receivedAt} · reçu de Garmin</span>
          </div>
        </div>
        <dl className="m-0 grid grid-cols-3 gap-2">
          <Figure label="Distance" value={String(activity.distanceKm).replace(".", ",")} unit=" km" />
          <Figure label="Durée" value={activity.duration} />
          <Figure label={activity.mainPaceLabel} value={activity.mainPace} accent />
        </dl>
        <p className="t-body hairline-top m-0 flex items-center gap-2 pt-4">
          <Icon name="checkCircle" size={18} stroke={2.4} className="flex-none text-intense-ink" />
          {activity.verdict}
        </p>
      </Glass>

      {activity.askFeel && (
        <section className="flex flex-col gap-2">
          <div className="flex flex-col gap-0.5 px-1">
            <h2 className="t-title">Comment c'était ?</h2>
            <span className="t-cap">Ta montre ne te l'a pas demandé cette fois</span>
          </div>
          <Segmented
            size="md"
            label="Comment c'était ?"
            items={FEELS}
            value={activity.feel}
            onChange={(feel) => void usePlan.getState().run((api) => api.logFeel(activity.id, feel))}
          />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <label htmlFor="note" className="t-title px-1">
          Un mot pour Reggie
        </label>
        <div className="flex items-end gap-2 rounded-group bg-surface p-2">
          <textarea
            id="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Facultatif. Mollet un peu raide sur la fin…"
            className="t-body min-w-0 flex-1 resize-none rounded-xl border-0 bg-transparent p-2 text-text"
          />
          <button
            type="button"
            aria-label="Envoyer à Reggie"
            onClick={sendNote}
            className="press flex size-11 flex-none items-center justify-center rounded-full border-0 bg-assistant text-on-accent"
          >
            <Icon name="send" size={20} stroke={2.4} />
          </button>
        </div>
      </section>

      <div className="flex min-h-14 items-center justify-between rounded-group bg-surface px-4">
        <span className="t-sub">Demain</span>
        <span className="t-strong">{next?.date === addDays(today, 1) ? next.title : "Repos"}</span>
      </div>
    </>
  );
}

function Figure({ label, value, unit, accent }: { label: string; value: string; unit?: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="t-cap">{label}</dt>
      <dd className={accent ? "t-num m-0 text-intense-ink" : "t-num m-0"}>
        {value}
        {unit && <span className="t-sub">{unit}</span>}
      </dd>
    </div>
  );
}
