import { act, createElement as h } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { ChunkBoundary } from "./ChunkBoundary.tsx";
import { AppCrash } from "./EmptyState.tsx";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Boom(): null {
  throw new Error("boom");
}

it("un écran qui plante montre le message calme et Réessayer", async () => {
  const onReload = vi.fn();
  const caught = vi.fn<(error: unknown) => void>();
  const host = document.createElement("div");
  await act(async () =>
    createRoot(host, { onCaughtError: caught }).render(
      // biome-ignore lint/correctness/noChildrenProp: a .ts test, no JSX
      h(ChunkBoundary, { fallback: () => h(AppCrash, { onReload }), children: h(Boom) }),
    ),
  );
  expect(host.textContent).toContain("Quelque chose a coincé");
  expect(host.textContent).toContain("Ton plan n'a rien perdu.");
  expect(caught).toHaveBeenCalledOnce();
  const button = host.querySelector("button");
  expect(button?.textContent).toContain("Réessayer");
  await act(async () => button?.click());
  expect(onReload).toHaveBeenCalledOnce();
});
