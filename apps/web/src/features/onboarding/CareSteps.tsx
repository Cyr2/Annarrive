import { PRIVACY_NOTE } from "@annarrive/protocol";
import { useEffect } from "react";
import { cx } from "../../lib/cx.ts";
import { Dot, IconTile } from "../../ui/bits.tsx";
import { Group, Section } from "../../ui/List.tsx";
import { SwitchRow } from "../program/SwitchRow.tsx";
import { NotificationsRow } from "../push/NotificationsRow.tsx";
import { usePush } from "../push/store.ts";
import { Help, update, useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

/** Her Garmin as the server sees it: Darius links it before she starts. */
function Garmin() {
  const watch = useOnboarding((s) => s.watch);
  useEffect(() => void useOnboarding.getState().checkWatch(), []);
  return (
    <Group>
      <div className="row">
        <span className="flex items-center gap-3">
          <IconTile tone="other" icon="watch" />
          <span className="t-body">Garmin</span>
        </span>
        {watch !== undefined && (
          <span className={cx("t-sub flex items-center gap-1.5", watch && "text-ok-deep")}>
            <Dot size="md" className={watch ? "bg-ok" : "bg-warn"} />
            {watch ? "Connectée" : "Pas encore reliée"}
          </span>
        )}
      </div>
    </Group>
  );
}

/** The watch, what Reggie may read on it, and notifications: what each one changes for her. */
export function ConsentStep() {
  const { useSleepHr } = useDraft();
  const push = usePush((s) => s.status);
  useEffect(() => {
    if (usePush.getState().status === "loading") void usePush.getState().check();
  }, []);
  return (
    <>
      <Garmin />
      <Section title="Ce que Reggie peut lire" footnote={PRIVACY_NOTE}>
        <Group>
          <SwitchRow
            title="Sommeil et fréquence cardiaque"
            detail="Le matin, si ta nuit ou ton cœur montrent de la fatigue, Reggie allège ta séance."
            checked={useSleepHr}
            onChange={(on) => update({ useSleepHr: on })}
          />
        </Group>
      </Section>
      {push !== "loading" && push !== "hidden" && (
        <Group>
          <NotificationsRow detail="Ton bilan du dimanche, une séance qui change." />
        </Group>
      )}
      <Help>
        Tout se change ensuite dans Réglages. Le reste prend une valeur par défaut : courses entre 7:00 et 21:30, aucun
        jour sans course, pas de muscu, aucune douleur.
      </Help>
    </>
  );
}
