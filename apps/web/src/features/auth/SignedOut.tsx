import { Icon } from "../../ui/Icon.tsx";
import { Screen } from "../../ui/Screen.tsx";

/** The session ended or never started: logging in happens through the one-time link, server side. */
export function SignedOut() {
  return (
    <Screen mood="rest">
      <h1 className="t-large">Talaria</h1>
      <p className="t-body m-0 flex items-start gap-2">
        <Icon name="info" size={20} className="mt-0.5 flex-none" />
        Ouvre le lien de connexion que tu as reçu.
      </p>
    </Screen>
  );
}
