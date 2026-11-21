import { type ComponentType, Suspense, useEffect } from "react";
import { ChunkBoundary, lazyChunk, retryChunks } from "../../ui/ChunkBoundary.tsx";
import { handOffSheet } from "../../ui/sheetHandoff.ts";
import { notify } from "../../ui/toast.ts";
import { usePlan } from "../plan/store.ts";
import { type SheetSpec, useSheet } from "./store.ts";

/** What every sheet receives: its spec, whether it is open, and how to close it (the store unmounts it after the slide). */
export type SheetProps<K extends SheetSpec["kind"]> = {
  spec: Extract<SheetSpec, { kind: K }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A change is on its way: the sheet's buttons wait. */
  busy: boolean;
  /** False when it took the place of another sheet: it is already up. */
  appear: boolean;
  /** Opened from another sheet: Retour goes back to it. */
  previous?: () => void;
  /** A sheet opened from this one is on screen: this one waits, hidden, with its state. */
  covered: boolean;
};

type Kind = SheetSpec["kind"];
type Loader<K extends Kind> = () => Promise<{ default: ComponentType<SheetProps<K>> }>;

// Each sheet is its own small file, fetched at idle (App.tsx) or the first time it opens.
const LOADERS: { [K in Kind]: Loader<K> } = {
  move: () => import("../move/MoveSheet.tsx"),
  change: () => import("../change/ChangeSheet.tsx"),
  unavailable: () => import("../unavailable/UnavailableSheet.tsx"),
  session: () => import("../session/SessionSheet.tsx"),
  event: () => import("../session/EventSheet.tsx"),
  add: () => import("../add/AddSheet.tsx"),
  strength: () => import("../strength/StrengthSheet.tsx"),
  setting: () => import("../program/SettingSheet.tsx"),
  goal: () => import("../program/GoalSheet.tsx"),
  lastTime: () => import("../program/LastTimeSheet.tsx"),
  watch: () => import("../program/WatchSheet.tsx"),
  timetable: () => import("../program/TimetableSheet.tsx"),
  target: () => import("../program/TargetSheet.tsx"),
  progression: () => import("../progression/ProgressionSheet.tsx"),
  level: () => import("../level/LevelSheet.tsx"),
};

function chunks<K extends Kind>(kind: K) {
  return lazyChunk(LOADERS[kind]);
}

const SHEETS: { [K in Kind]: ComponentType<SheetProps<K>> & { preload: () => void } } = {
  move: chunks("move"),
  change: chunks("change"),
  unavailable: chunks("unavailable"),
  session: chunks("session"),
  event: chunks("event"),
  add: chunks("add"),
  strength: chunks("strength"),
  setting: chunks("setting"),
  goal: chunks("goal"),
  lastTime: chunks("lastTime"),
  watch: chunks("watch"),
  timetable: chunks("timetable"),
  target: chunks("target"),
  progression: chunks("progression"),
  level: chunks("level"),
};

/** Fetches a sheet's file ahead of its first opening, so it rises at once. */
export function preloadSheet(kind: Kind) {
  SHEETS[kind].preload();
}

function render<K extends Kind>(spec: Extract<SheetSpec, { kind: K }>, props: Omit<SheetProps<K>, "spec">) {
  const Component: ComponentType<SheetProps<K>> = SHEETS[spec.kind];
  return <Component spec={spec} {...props} />;
}

/** The sheet could not load (offline before it was ever cached): say so, and offer to open it again. */
function failed(spec: SheetSpec) {
  useSheet.getState().close();
  void notify("Pas de connexion : cette fiche ne s'est pas ouverte.", {
    label: "Réessayer",
    onClick: () => {
      retryChunks();
      useSheet.getState().show(spec);
    },
  });
}

export function SheetHost() {
  const { current, below, open, chained, close, back } = useSheet();
  const busy = usePlan((s) => s.busy);
  // A sheet takes the place of another (opened from it, Retour, the next step): the one on screen is copied before
  // React swaps them, to slide out as the next one slides in.
  useEffect(
    () =>
      useSheet.subscribe((s, before) => {
        if (s.open && before.open && s.current !== before.current) handOffSheet(s.below.length >= before.below.length);
      }),
    [],
  );
  if (!current) return null;
  // Keyed by place in the stack: a sheet keeps its state while another one covers it.
  return [...below, current].map((spec, index) => {
    const covered = index < below.length;
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: the place in the stack is what identifies a sheet here.
      <ChunkBoundary key={`${index}:${spec.kind}`} fallback={() => null} onError={() => failed(spec)}>
        <Suspense fallback={null}>
          {render(spec, {
            open,
            busy,
            covered,
            appear: !chained,
            previous: index > 0 ? back : undefined,
            onOpenChange: (next) => (next ? undefined : close()),
          })}
        </Suspense>
      </ChunkBoundary>
    );
  });
}
