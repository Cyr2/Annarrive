import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { canAutofillPasskeys, canUsePasskeys, logInWithPasskey, logInWithPassword } from "../../api/auth.ts";
import { errorMessage } from "../../api/errors.ts";
import { Button } from "../../ui/controls.tsx";
import { Group, RowInput, Section } from "../../ui/List.tsx";
import { LogoSlot } from "../../ui/LogoSlot.tsx";
import { passkeyError, thisDevicePasskey } from "./unlock.ts";

/** The login screens' frame: the logo, a title and one sentence, then what to do. */
export function AuthFrame({ title, lead, children }: { title: string; lead: string; children: ReactNode }) {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-gutter"
      style={{ paddingBlock: "max(24px, env(safe-area-inset-top)) max(24px, env(safe-area-inset-bottom))" }}
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <LogoSlot size={80} className="mb-2" />
        <h1 className="t-large m-0">{title}</h1>
        <p className="t-body m-0 max-w-xs text-ink-2">{lead}</p>
      </div>
      {children}
    </main>
  );
}

export function AuthAlert({ message }: { message: string | null }) {
  return (
    <p role="alert" className={message ? "t-sub m-0 rounded-row bg-warn-wash px-4 py-3 text-warn-deep" : "sr-only"}>
      {message}
    </p>
  );
}

/**
 * No session on this device. Face ID first: one tap, nothing to type. The password opens the first session on
 * a new phone (then /face-id offers to add Face ID), and stays the way back if Face ID is lost.
 */
export function SignedOut() {
  const { name: unlock, icon } = thisDevicePasskey();
  const passkeys = typeof PublicKeyCredential !== "undefined";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Where the browser can, the name field also offers the phone's passkey among its suggestions.
  useEffect(() => {
    let live = true;
    const autofill = async () => {
      if (!(await canAutofillPasskeys())) return;
      await logInWithPasskey(true);
      if (live) location.reload();
    };
    autofill().catch((failure: unknown) => {
      if (live) setError(passkeyError(failure, unlock));
    });
    return () => {
      live = false;
    };
  }, [unlock]);

  async function attempt(work: () => Promise<void>, onError: (failure: unknown) => string | null) {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (failure) {
      setError(onError(failure));
      setBusy(false);
    }
  }

  const withPasskey = () =>
    attempt(
      async () => {
        await logInWithPasskey();
        location.reload();
      },
      (failure) => passkeyError(failure, unlock),
    );

  const withPassword = (event: FormEvent) => {
    event.preventDefault();
    void attempt(async () => {
      await logInWithPassword(username, password);
      // A full load, so every screen starts again with the new session.
      if (await canUsePasskeys()) location.assign("/face-id");
      else location.reload();
    }, errorMessage);
  };

  return (
    <AuthFrame title="Connecte-toi" lead="Ensuite, tu restes connectée sur ce téléphone.">
      <AuthAlert message={error} />
      {passkeys && (
        <Button variant="filled" size="large" icon={icon} disabled={busy} onClick={withPasskey}>
          Se connecter avec {unlock}
        </Button>
      )}
      <form onSubmit={withPassword} className="flex flex-col gap-3">
        <Section title={passkeys ? "Ou avec ton mot de passe" : undefined}>
          <Group>
            <RowInput label="Identifiant" value={username} onChange={setUsername} autoComplete="username webauthn" />
            <RowInput
              label="Mot de passe"
              type="password"
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
            />
          </Group>
        </Section>
        <Button
          type="submit"
          variant={passkeys ? "glass" : "filled"}
          size="large"
          disabled={busy || !username.trim() || !password}
        >
          Se connecter
        </Button>
        <p className="t-cap m-0 text-center">Mot de passe oublié : demande à Darius d'en créer un nouveau.</p>
      </form>
    </AuthFrame>
  );
}
