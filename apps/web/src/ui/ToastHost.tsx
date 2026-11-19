import { Suspense, useEffect } from "react";
import { ChunkBoundary, lazyChunk } from "./ChunkBoundary.tsx";
import { TOAST_BOTTOM, TOAST_MS, useToastHost } from "./toast.ts";

export const loadToast = () => import("./Toast.tsx");
const Toast = lazyChunk(loadToast);

export function ToastHost() {
  const wanted = useToastHost((s) => s.wanted);
  return (
    <>
      {wanted && (
        <ChunkBoundary fallback={() => null} onError={() => useToastHost.getState().failed?.()}>
          <Suspense fallback={null}>
            <Toast />
          </Suspense>
        </ChunkBoundary>
      )}
      <PlainToast />
    </>
  );
}

/** The same pill as Sonner's, without Sonner: it ships with the first screen, so it shows even offline. */
function PlainToast() {
  const plain = useToastHost((s) => s.plain);
  useEffect(() => {
    if (!plain) return;
    const timer = setTimeout(() => useToastHost.setState({ plain: undefined }), TOAST_MS);
    return () => clearTimeout(timer);
  }, [plain]);
  if (!plain) return null;
  const { message, action } = plain;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-gutter"
      style={{ bottom: TOAST_BOTTOM }}
    >
      <div
        role="status"
        className="ui-glass ui-toast pointer-events-auto flex min-h-13 w-fit max-w-full items-center gap-2 rounded-full py-1 pr-5 pl-5 t-label text-ink has-[button]:pr-1.5"
      >
        <span className="flex-1">{message}</span>
        {action && (
          <button
            type="button"
            className="press min-h-11 shrink-0 whitespace-nowrap rounded-full border-0 bg-transparent px-3 t-strong text-action"
            onClick={() => {
              useToastHost.setState({ plain: undefined });
              action.onClick();
            }}
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
