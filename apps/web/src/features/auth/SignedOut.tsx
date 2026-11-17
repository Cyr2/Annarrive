import { Button } from "../../ui/controls.tsx";
import { LogoSlot } from "../../ui/LogoSlot.tsx";
import { Surface } from "../../ui/Surface.tsx";

/**
 * The session ended or never started: logging in happens through the one-time link, server side. Réessayer
 * covers a network cut taken for a 401: the page reloads and asks again.
 */
export function SignedOut() {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-gutter"
      style={{ paddingBlock: "max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-bottom))" }}
    >
      <Surface className="flex flex-col items-center gap-4 px-6 py-8 text-center">
        <LogoSlot />
        <h1 className="t-large">Tu es déconnectée</h1>
        <p className="t-body m-0 text-ink-2">
          Ouvre le dernier lien de connexion reçu par message : il te reconnecte sur ce téléphone.
        </p>
        <Button variant="tinted" size="large" icon="change" className="w-full" onClick={() => location.reload()}>
          Réessayer
        </Button>
      </Surface>
    </main>
  );
}
