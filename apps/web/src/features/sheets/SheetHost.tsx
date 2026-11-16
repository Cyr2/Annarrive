import { type ComponentType, lazy, Suspense } from "react";
import { type SheetSpec, useSheet } from "./store.ts";

/** What every sheet receives: its spec, whether it is open, and how to close it (the store unmounts it after the slide). */
export type SheetProps<K extends SheetSpec["kind"]> = {
  spec: Extract<SheetSpec, { kind: K }>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

// Each sheet is its own small file, fetched the first time it opens.
const SHEETS: { [K in SheetSpec["kind"]]: ComponentType<SheetProps<K>> } = {
  move: lazy(() => import("../move/MoveSheet.tsx")),
  change: lazy(() => import("../change/ChangeSheet.tsx")),
  unavailable: lazy(() => import("../unavailable/UnavailableSheet.tsx")),
  session: lazy(() => import("../session/SessionSheet.tsx")),
  event: lazy(() => import("../session/EventSheet.tsx")),
  add: lazy(() => import("../add/AddSheet.tsx")),
  strength: lazy(() => import("../strength/StrengthSheet.tsx")),
  setting: lazy(() => import("../program/SettingSheet.tsx")),
  goal: lazy(() => import("../program/GoalSheet.tsx")),
  watch: lazy(() => import("../program/WatchSheet.tsx")),
  cycle: lazy(() => import("../program/CycleSheet.tsx")),
  stop: lazy(() => import("../program/StopSheet.tsx")),
};

function render<K extends SheetSpec["kind"]>(
  spec: Extract<SheetSpec, { kind: K }>,
  props: Omit<SheetProps<K>, "spec">,
) {
  const Component: ComponentType<SheetProps<K>> = SHEETS[spec.kind];
  return <Component spec={spec} {...props} />;
}

export function SheetHost() {
  const { current, open, close } = useSheet();
  if (!current) return null;
  return (
    <Suspense fallback={null}>
      {render(current, { open, onOpenChange: (next) => (next ? undefined : close()) })}
    </Suspense>
  );
}
