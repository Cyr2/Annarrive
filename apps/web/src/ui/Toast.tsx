import { useEffect } from "react";
import { Toaster } from "sonner";
import { useToastHost } from "./toast.ts";

// Above the tab bar, and above Reggie's field when it is on screen (Composer.tsx sets --composer-height).
const BOTTOM = "calc(env(safe-area-inset-bottom) + var(--space-above-tabbar) + var(--composer-height, 0px))";

/** A glass pill above the floating tab bar, within the thumb's reach for « Annuler » (Liquid Glass recipe in CSS: Sonner draws its own element), its action in the action blue. */
export default function Toast() {
  useEffect(() => {
    useToastHost.getState().ready?.();
  }, []);
  return (
    <Toaster
      position="bottom-center"
      offset={{ bottom: BOTTOM }}
      mobileOffset={{
        bottom: BOTTOM,
        left: "var(--spacing-gutter)",
        right: "var(--spacing-gutter)",
      }}
      visibleToasts={1}
      // Sonner's own sheet sets the system font on its list.
      style={{ fontFamily: "inherit" }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "ui-glass ui-toast flex items-center gap-2 rounded-full min-h-13 py-1 pl-5 pr-5 has-[button]:pr-1.5 t-label text-ink font-normal",
          title: "flex-1",
          actionButton: "press min-h-11 rounded-full border-0 bg-transparent px-3 t-strong text-action",
        },
      }}
    />
  );
}
