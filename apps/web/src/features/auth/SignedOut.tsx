import { Button } from "../../ui/controls.tsx";
import { Icon, type IconName } from "../../ui/Icon.tsx";
import { LogoSlot } from "../../ui/LogoSlot.tsx";
import { Surface } from "../../ui/Surface.tsx";

const STEPS: [IconName, string][] = [
  ["reggie", "Ouvre le dernier lien de connexion reçu par message."],
  ["checkCircle", "Talaria s'ouvre ici, et tu restes connectée."],
];

/**
 * The session ended or never started: logging in happens through the one-time link, server side. Réessayer
 * covers a network cut taken for a 401: the page reloads and asks again.
 */
export function SignedOut() {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-gutter"
      style={{ paddingBlock: "max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoSlot size={80} className="mb-2" />
        <h1 className="t-large m-0">Tu es déconnectée</h1>
        <p className="t-body m-0 max-w-xs text-ink-2">Ta session a pris fin sur ce téléphone. Rien n'est perdu.</p>
      </div>
      <Surface as="section" aria-label="Pour revenir" className="flex flex-col py-1">
        <ol className="m-0 list-none p-0">
          {STEPS.map(([icon, text]) => (
            <li key={icon} className="row items-start gap-3 py-3">
              <Icon name={icon} size={22} className="mt-px flex-none text-ink-2" />
              <span className="t-body flex-1">{text}</span>
            </li>
          ))}
        </ol>
      </Surface>
      <div className="flex flex-col gap-2">
        <Button variant="filled" size="large" icon="change" onClick={() => location.reload()}>
          Réessayer
        </Button>
        <p className="t-cap m-0 text-center">
          Un lien sert une seule fois et expire au bout de 15 minutes. S'il ne marche plus, demande-en un nouveau.
        </p>
      </div>
    </main>
  );
}
