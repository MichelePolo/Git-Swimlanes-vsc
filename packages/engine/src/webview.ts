import { createRoot } from "react-dom/client";
import { createElement } from "react";
import type { Host2Wv, Theme, Wv2Host } from "@michelepolo/git-swimlanes-contract";
import { GitSwimlanes } from "./ui/GitSwimlanes.js";
import { createController, type ViewState } from "./webviewController.js";
import "./engine.css";

declare global {
  interface Window {
    __host?: { post(msg: Wv2Host): void };
    GitSwimlanes: {
      receive(msg: Host2Wv): void;
      onReady?: () => void;
    };
  }
}

/** Apply the host theme's base colors as CSS variables (lane hues stay name-derived). */
function applyTheme(theme?: Theme): void {
  if (!theme) return;
  const r = document.documentElement.style;
  const vars: Array<[keyof Theme, string]> = [
    ["bg", "--bg"], ["panel", "--panel"], ["panel2", "--panel2"],
    ["line", "--line"], ["txt", "--txt"], ["dim", "--dim"], ["accent", "--accent"],
  ];
  for (const [key, cssVar] of vars) {
    const v = theme[key];
    if (typeof v === "string") r.setProperty(cssVar, v);
  }
}

function boot(): void {
  const el = document.getElementById("app");
  if (!el) throw new Error("git-swimlanes: #app mount point not found");
  const root = createRoot(el);

  const host = { post: (msg: Wv2Host) => window.__host?.post(msg) };
  const controller = createController(host, render);

  function render(state: ViewState): void {
    applyTheme(state.theme);
    root.render(
      createElement(GitSwimlanes, {
        log: state.log,
        commits: state.commits,
        theme: state.theme,
        onRequestDiff: controller.requestDiff,
      }),
    );
  }

  // Preserve any onReady the host bridge already installed; expose receive().
  window.GitSwimlanes = Object.assign(window.GitSwimlanes ?? {}, { receive: controller.receive });

  render({ log: "" });
  window.GitSwimlanes.onReady?.();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
