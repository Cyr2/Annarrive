import { PRIVACY_NOTE } from "@annarrive/protocol";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { hasPasskey, logOut, registerPasskey } from "../../api/auth.ts";
import { ApiError, errorMessage } from "../../api/errors.ts";
import type { Program, Settings } from "../../api/schemas.ts";
import { signOut } from "../../api/session.ts";
import { ConfirmDialog } from "../../ui/ConfirmDialog.tsx";
import { LoadFailed } from "../../ui/EmptyState.tsx";
import { Icon } from "../../ui/Icon.tsx";
import { Group, RowButton, Section } from "../../ui/List.tsx";
import { PullToRefresh } from "../../ui/PullToRefresh.tsx";
import { Screen } from "../../ui/Screen.tsx";
import { Skeleton } from "../../ui/Skeleton.tsx";
import { TextButton } from "../../ui/TextButton.tsx";
import { notify } from "../../ui/toast.ts";
import { strengthShort } from "../add/add.ts";
import { passkeyError, thisDevicePasskey } from "../auth/unlock.ts";
import { usePlan } from "../plan/store.ts";
import { NotificationsRow } from "../push/NotificationsRow.tsx";
import { usePush } from "../push/store.ts";
import { useSheet } from "../sheets/store.ts";
import { refreshTimetable } from "../week/RefreshRow.tsx";
import { ReportIssue } from "./ReportIssue.tsx";
import { Hours, Runs, Watch } from "./SettingGroups.tsx";
import { SwitchRow } from "./SwitchRow.tsx";
import { leaveSettings } from "./settingsPath.ts";
import { TimetableRows } from "./TimetableRow.tsx";

/** Réglages, pushed from Programme's gear: one group per subject, in the order she is likely to need them. */
export default function SettingsScreen() {
  const program = usePlan((s) => s.program);
  const status = usePlan((s) => s.programStatus);
  const [, navigate] = useLocation();
  useEffect(() => {
    void usePlan.getState().loadProgram();
  }, []);
  return (
    <Screen>
      <header className="-mx-2 -mb-2 grid grid-cols-[1fr_auto_1fr] items-center">
        <TextButton icon="chevronLeft" className="justify-self-start pr-2" onClick={() => leaveSettings(navigate)}>
          Programme
        </TextButton>
        <h1 className="t-body m-0 font-bold">Réglages</h1>
      </header>
      <PullToRefresh onRefresh={refreshTimetable} />
      {!program && status === "error" && (
        <LoadFailed
          title="Réglages indisponibles"
          what="tes réglages"
          onRetry={() => void usePlan.getState().loadProgram()}
        />
      )}
      {!program && status !== "error" && <Skeleton label="Chargement de tes réglages" />}
      {program && <SettingGroups program={program} />}
    </Screen>
  );
}

function SettingGroups({ program }: { program: Program }) {
  const show = useSheet((s) => s.show);
  const push = usePush((s) => s.status);
  const { settings } = program;
  const toggle = (patch: Partial<Settings>) =>
    void usePlan.getState().apply((api) => api.updateSettings(patch), { quiet: true });
  return (
    <>
      <Runs settings={settings} />
      <Hours settings={settings} />

      <Section title="Ta muscu habituelle">
        <Group>
          {program.strength.map((t) => (
            <RowButton
              key={t.id}
              label={t.name}
              value={strengthShort(t)}
              onClick={() => show({ kind: "strength", templateId: t.id })}
            />
          ))}
          <RowButton tone="link" label="Ajouter une séance" onClick={() => show({ kind: "strength" })} />
        </Group>
      </Section>

      <Section
        title="Emploi du temps"
        footnote="Il se relit tout seul plusieurs fois par jour. Actualise si un cours vient d'être annulé."
      >
        <Group>
          <TimetableRows program={program} />
        </Group>
      </Section>

      <Watch watch={program.watch} />

      <Section title="Santé" footnote={PRIVACY_NOTE}>
        <Group>
          <SwitchRow
            title="Sommeil et fréquence cardiaque"
            detail="Lus sur ta Garmin, pour alléger une séance après une mauvaise nuit."
            checked={settings.recoveryData}
            onChange={(recoveryData) => toggle({ recoveryData })}
          />
        </Group>
      </Section>

      {push !== "loading" && push !== "hidden" && (
        // No group label: the row already says « Notifications ».
        <Section footnote="Ta semaine le dimanche soir, une course déplacée quand un cours change, et un mot pour Reggie après chaque course.">
          <Group>
            <NotificationsRow />
          </Group>
        </Section>
      )}

      <Account />

      {!program.maintenance && <StopRow race={program.goal.race} />}
      <ReportIssue />
    </>
  );
}

/** Compte: Face ID on this phone, and Se déconnecter (confirmed, since signing in again takes a moment). */
function Account() {
  const wording = thisDevicePasskey();
  const unlock = wording.name;
  // Only a browser without WebAuthn hides the row; null while the account is being asked.
  const supported = typeof PublicKeyCredential !== "undefined";
  const [on, setOn] = useState<boolean | null>(null);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (supported) void hasPasskey().then(setOn);
  }, [supported]);
  const addPasskey = async () => {
    try {
      await registerPasskey();
      setOn(true);
      void notify(`${wording.enabled} : rien à taper la prochaine fois.`);
    } catch (failure) {
      const message = passkeyError(failure, unlock);
      if (message) void notify(message);
    }
  };
  const leave = async () => {
    try {
      await logOut();
    } catch (failure) {
      // Already signed out on the server: the app follows. Anything else: she stays, and reads why.
      if (!(failure instanceof ApiError && failure.status === 401)) {
        void notify(errorMessage(failure));
        return;
      }
    }
    signOut();
  };
  return (
    <Section title="Compte">
      <Group>
        {supported && on === true && (
          <div className="row">
            <span className="t-body flex items-center gap-2">
              <Icon name={wording.icon} size={20} className="text-ink-2" />
              {wording.enabled}
            </span>
            <Icon name="check" size={20} stroke={2.5} className="text-ok-deep" />
          </div>
        )}
        {supported && on === false && (
          <RowButton tone="link" label={wording.enable} onClick={() => void addPasskey()} />
        )}
        <RowButton tone="link" label="Se déconnecter" onClick={() => setLeaving(true)} />
      </Group>
      <ConfirmDialog
        open={leaving}
        onClose={() => setLeaving(false)}
        title="Te déconnecter ?"
        message={`Pour revenir, ${unlock} ou ton mot de passe.`}
        actions={[{ label: "Se déconnecter", onClick: () => void leave() }]}
      />
    </Section>
  );
}

/** Arrêter le programme: confirmed in an alert, then maintenance mode. */
function StopRow({ race }: { race: string }) {
  const [asking, setAsking] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <Group>
        <TextButton tone="danger" className="min-h-13 w-full" onClick={() => setAsking(true)}>
          Arrêter le programme
        </TextButton>
      </Group>
      <p className="t-cap m-0 px-4">
        Tu passes en mode entretien : 2 à 3 courses par semaine, dont une un peu plus rythmée.
      </p>
      <ConfirmDialog
        open={asking}
        onClose={() => setAsking(false)}
        title={`Arrêter ton plan ${race.toLowerCase()} ?`}
        message="Tu passes en mode entretien : 2 à 3 courses par semaine, dont une un peu plus rythmée."
        actions={[
          { label: "Arrêter le programme", onClick: () => void usePlan.getState().apply((api) => api.stopProgram()) },
        ]}
      />
    </section>
  );
}
