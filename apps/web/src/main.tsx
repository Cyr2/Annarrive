import "./zod-config.ts";
import { StrictMode, startTransition } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");

// A transition: React renders the first screen in short slices, so no single task holds the main thread.
startTransition(() =>
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
