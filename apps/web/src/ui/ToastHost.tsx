import { lazy, Suspense } from "react";
import { useToastHost } from "./toast.ts";

const Toast = lazy(() => import("./Toast.tsx"));

export function ToastHost() {
  const wanted = useToastHost((s) => s.wanted);
  if (!wanted) return null;
  return (
    <Suspense fallback={null}>
      <Toast />
    </Suspense>
  );
}
