import "./zod-config.ts";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { installJournal, renderError } from "./api/journal.ts";
import "./styles/app.css";

installJournal();

const root = document.getElementById("root");
if (!root) throw new Error("Élément #root introuvable");

// Every error a boundary catches (a screen that did not load) or none does, with the components it went through.
const journaled = (error: unknown, info: { componentStack?: string }) => {
  console.error(error);
  renderError(error, info.componentStack);
};

createRoot(root, { onCaughtError: journaled, onUncaughtError: journaled }).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
