import { useState } from "react";
import { onboardingApi } from "../../api/onboarding.ts";
import { Button } from "../../ui/controls.tsx";
import { Icon, type IconName } from "../../ui/Icon.tsx";
import { Group, Section } from "../../ui/List.tsx";

function Note({ icon, children }: { icon: IconName; children: string }) {
  return (
    <div className="row items-start gap-3 py-3">
      <Icon name={icon} size={22} className="mt-px flex-none text-ink-2" />
      <p className="t-body m-0 flex-1">{children}</p>
    </div>
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
  unsupported: "Ouvre Annarrivé depuis ton écran d'accueil pour les activer.",
  failed: "Ça n'a pas marché. Tu pourras réessayer dans Programme.",
};

export function Notifications() {
  const [state, setState] = useState<PushState>("idle");
  const ask = async () => {
    setState("asking");
    setState(await enablePush().catch((): PushState => "failed"));
  };
  return (
    <Section title="Notifications" footnote="Rien d'autre : pas de rappel, pas de pub.">
      <Group>
        <Note icon="week">Le dimanche soir : ta semaine est prête.</Note>
        <Note icon="move">Quand un cours change : la course déplacée, et où.</Note>
      </Group>
      {state !== "on" && (
        <Button variant="tinted" tone="action" disabled={state === "asking"} onClick={() => void ask()}>
          Activer les notifications
        </Button>
      )}
      <p aria-live="polite" className="t-sub m-0 px-4 empty:hidden">
        {PUSH_TEXT[state] ?? ""}
      </p>
    </Section>
  );
}
