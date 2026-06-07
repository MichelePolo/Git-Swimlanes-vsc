import { createRoot } from "react-dom/client";
import { createElement } from "react";
import type { Host2Wv } from "@michelepolo/git-swimlanes-contract";
import { GitSwimlanes } from "./ui/GitSwimlanes.js";
import "./engine.css";

declare global {
  interface Window {
    __host?: { post(msg: unknown): void };
    GitSwimlanes: {
      receive(msg: Host2Wv): void;
      onReady?: () => void;
    };
  }
}

function boot(): void {
  const el = document.getElementById("app");
  if (!el) throw new Error("git-swimlanes: #app mount point not found");
  const root = createRoot(el);
  root.render(createElement(GitSwimlanes, {}));

  window.GitSwimlanes = {
    receive(_msg: Host2Wv): void {
      // TODO (spec §6.3): route init/setLog/diffResult/diffError/theme into React state.
    },
  };

  // Signal the host bridge that the engine is mounted and ready for messages.
  window.GitSwimlanes.onReady?.();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
