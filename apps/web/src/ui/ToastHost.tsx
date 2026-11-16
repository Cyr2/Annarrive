import { lazy, Suspense } from "react";
import { useToastHost } from "./toast.ts";

const SonnerToaster = lazy(() => import("./SonnerToaster.tsx"));

export function ToastHost() {
  const wanted = useToastHost((s) => s.wanted);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <SonnerToaster />
    </Suspense>
  );
}
