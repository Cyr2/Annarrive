import { useEffect, useId, useState } from "react";
import { onboardingApi } from "../../api/onboarding.ts";
import { Button } from "../../ui/Button.tsx";
import { Icon, type IconName } from "../../ui/Icon.tsx";
import { Group } from "../../ui/List.tsx";
import { Switch } from "../../ui/Switch.tsx";
import { PainStep as PainLevel, ZoneStep } from "../unavailable/steps.tsx";
import { BigChoice, Card, update, useDraft } from "./parts.tsx";
import { useOnboarding } from "./store.ts";

export function PainStep() {
  const draft = useDraft();
  return (
    <>
      <div className="flex flex-col gap-2">
        <BigChoice label="Non, tout va bien" on={!draft.pain} onClick={() => update({ pain: false })} />
        <BigChoice label="Oui, quelque chose me gêne" on={draft.pain} onClick={() => update({ pain: true })} />
      </div>
      {draft.pain && <ZoneStep zone={draft.zone} onChange={(zone) => update({ zone })} />}
      {draft.pain && draft.zone && (
        <PainLevel pain={draft.level} zone={draft.zone} onChange={(level) => update({ level })} />
      )}
    </>
  );
}

function Consent({
  title,
  detail,
  checked,
  onChange,
}: {
  title: string;
  detail: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="row py-3">
      <span className="flex min-w-0 flex-col gap-0.5">
        <span id={id} className="t-body">
          {title}
        </span>
        <span className="t-cap">{detail}</span>
      </span>
      <Switch checked={checked} onChange={onChange} labelledBy={id} />
    </div>
  );
}

export function ConsentsStep() {
  const draft = useDraft();
  return (
    <Group>
      <Consent
        title="Sommeil et fréquence cardiaque"
        detail="Lus sur ta Garmin, pour alléger une séance après une mauvaise nuit."
        checked={draft.useSleepHr}
        onChange={(useSleepHr) => update({ useSleepHr })}
      />
      <Consent
        title="Cycle menstruel"
        detail="Désactivé par défaut. Activé, tu peux noter tes symptômes. L'app n'adapte jamais tes séances à la phase du cycle."
        checked={draft.cycleTracking}
        onChange={(cycleTracking) => update({ cycleTracking })}
      />
    </Group>
  );
}

function Note({ icon, children }: { icon: IconName; children: string }) {
  return (
    <Card className="flex-row items-start">
      <Icon name={icon} className="mt-px flex-none text-assistant" />
      <p className="t-body m-0">{children}</p>
    </Card>
  );
}

export function TimetableStep() {
  const linked = useOnboarding((s) => s.linked);
  useEffect(() => void useOnboarding.getState().checkTimetable(), []);
  if (linked === undefined) return <p className="t-sub m-0">Vérification de ton emploi du temps.</p>;
  return linked ? (
    <Note icon="checkCircle">
      Ton emploi du temps est relié. Tes cours apparaissent dans Semaine, et tes courses se placent autour.
    </Note>
  ) : (
    <Note icon="class">
      Pas encore relié. Envoie le lien de ton emploi du temps à Darius, il s'en occupe. Tu peux continuer sans.
    </Note>
  );
}

type PushState = "idle" | "asking" | "on" | "denied" | "unsupported" | "failed";

/** The real permission prompt, only once she taps (iOS refuses it otherwise, and it would come out of nowhere). */
async function enablePush(): Promise<PushState> {
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  if ((await Notification.requestPermission()) !== "granted") return "denied";
  const client = await onboardingApi();
  const key = await client.pushKey();
  if (key) {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    await client.subscribe(subscription.toJSON());
  }
  return "on";
}

const PUSH_TEXT: Partial<Record<PushState, string>> = {
  on: "Notifications activées.",
  denied: "Refusées. Tu pourras les activer dans les réglages de l'iPhone.",
  unsupported: "Ouvre Talaria depuis ton écran d'accueil pour les activer.",
  failed: "Ça n'a pas marché. Tu pourras réessayer dans Programme.",
};

export function NotificationsStep() {
  const [state, setState] = useState<PushState>("idle");
  const ask = async () => {
    setState("asking");
    setState(await enablePush().catch((): PushState => "failed"));
  };
  return (
    <>
      <Note icon="week">Le dimanche soir : ta semaine est prête.</Note>
      <Note icon="move">Quand un cours change : la course déplacée, et où.</Note>
      {state === "on" ? null : (
        <Button variant="tintedBlue" disabled={state === "asking"} onClick={() => void ask()}>
          Activer les notifications
        </Button>
      )}
      <p aria-live="polite" className="t-sub m-0 px-1">
        {PUSH_TEXT[state] ?? ""}
      </p>
    </>
  );
}
