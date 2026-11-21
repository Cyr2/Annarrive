import { useEffect, useState } from "react";
import { canUsePasskeys, registerPasskey } from "../../api/auth.ts";
import { Button } from "../../ui/controls.tsx";
import { AuthAlert, AuthFrame } from "./SignedOut.tsx";
import { passkeyError, thisDevicePasskey } from "./unlock.ts";

/**
 * Right after a first login on a device (password or link): one tap adds its Face ID, so the next login is one
 * tap too. A device without it goes straight on.
 */
export default function FaceIdOffer({ onDone }: { onDone: () => void }) {
  const { name: unlock, icon } = thisDevicePasskey();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void canUsePasskeys().then((can) => {
      if (!can) onDone();
    });
  }, [onDone]);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      await registerPasskey();
      onDone();
    } catch (failure) {
      const message = passkeyError(failure, unlock);
      // Nothing to say (closed, or already set up on this phone): she carries on without it.
      if (message === null) onDone();
      setError(message);
      setBusy(false);
    }
  }

  return (
    <AuthFrame title="Tu es connectée" lead={`La prochaine fois, ${unlock} suffit : rien à taper.`}>
      <AuthAlert message={error} />
      <div className="flex flex-col gap-2">
        <Button variant="filled" size="large" icon={icon} disabled={busy} onClick={() => void activate()}>
          Utiliser {unlock}
        </Button>
        <Button size="large" disabled={busy} onClick={onDone}>
          Plus tard
        </Button>
      </div>
    </AuthFrame>
  );
}
