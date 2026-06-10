import { createRoot } from "react-dom/client";
import { createElement } from "react";
import type { CommitNode, Host2Wv, Theme, Wv2Host } from "@michelepolo/git-swimlanes-contract";
import workerCode from "inline:worker";
import { GitSwimlanes } from "./ui/GitSwimlanes.js";
import { parseLog } from "./model/parseLog.js";
import { createController, type ViewState } from "./webviewController.js";
import "./engine.css";

/**
 * A log parser that runs off the main thread in a Blob-URL Web Worker (so huge logs don't
 * freeze the UI), falling back to synchronous parsing where Worker is unavailable. See §9.
 */
function createParser(): (log: string) => Promise<CommitNode[]> {
  const sync = (log: string): Promise<CommitNode[]> => Promise.resolve(parseLog(log).commits);
  if (typeof Worker === "undefined") return sync;

  let worker: Worker;
  try {
    const url = URL.createObjectURL(new Blob([workerCode], { type: "application/javascript" }));
    worker = new Worker(url);
  } catch {
    return sync; // Blob/Worker construction blocked → parse on the main thread
  }

  let seq = 0;
  let dead = false;
  const pending = new Map<number, { resolve: (commits: CommitNode[]) => void; log: string }>();
  // If the worker errors at runtime, settle every in-flight request synchronously so the
  // UI never wedges, and route all future parses to the main thread.
  const fallbackAll = (): void => {
    dead = true;
    for (const { resolve, log } of pending.values()) resolve(parseLog(log).commits);
    pending.clear();
  };
  worker.onmessage = (e: MessageEvent<{ id: number; commits: CommitNode[] }>) => {
    pending.get(e.data.id)?.resolve(e.data.commits);
    pending.delete(e.data.id);
  };
  worker.onerror = fallbackAll;
  worker.onmessageerror = fallbackAll;

  return (log) => {
    if (dead) return sync(log);
    return new Promise<CommitNode[]>((resolve) => {
      const id = ++seq;
      pending.set(id, { resolve, log });
      worker.postMessage({ id, log });
    });
  };
}

/** Persisted webview UI state (VS Code getState/setState). */
interface PersistedState {
  expanded?: string[];
}

declare global {
  interface Window {
    __host?: {
      post(msg: Wv2Host): void;
      /** Optional UI-state persistence (VS Code). Absent on hosts without it (JCEF). */
      getState?(): PersistedState | undefined;
      setState?(state: PersistedState): void;
    };
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

  // Restore persisted UI state (no-op on hosts without getState, e.g. JCEF).
  const initialExpanded = window.__host?.getState?.()?.expanded;
  const persistExpanded = (expanded: string[]): void => {
    const cur = window.__host?.getState?.() ?? {};
    window.__host?.setState?.({ ...cur, expanded });
  };

  const parse = createParser();
  let latest: ViewState = { log: "" };
  let parsedLog: string | undefined;
  let parsedCommits: CommitNode[] | undefined;

  function mount(commits: CommitNode[] | undefined, state: ViewState): void {
    root.render(
      createElement(GitSwimlanes, {
        commits,
        log: commits ? undefined : state.log,
        theme: state.theme,
        onRequestDiff: controller.requestDiff,
        onCommitSelect: (c) => host.post({ type: "commitSelected", hash: c.hash }),
        onOpenFile: (req) => host.post({ type: "openFile", path: req.path, hash: req.hash }),
        initialExpanded,
        onExpandedChange: persistExpanded,
        repos: state.repos,
        currentRepo: state.currentRepo,
        onSelectRepo: (id) => host.post({ type: "selectRepo", id }),
        onFetchPullRefs: () => host.post({ type: "fetchPullRefs" }),
        viewConfig: state.viewConfig,
        onViewConfigChange: (config) => host.post({ type: "setViewConfig", config }),
        status: state.status,
        onPull: () => host.post({ type: "pull" }),
        onFetch: () => host.post({ type: "fetch" }),
        onCreateBranch: (hash) => host.post({ type: "createBranch", hash }),
        onCreateTag: (hash) => host.post({ type: "createTag", hash }),
        onDeleteBranch: (name) => host.post({ type: "deleteBranch", name }),
        onDeleteTag: (name) => host.post({ type: "deleteTag", name }),
        onCheckout: (target, detach) => host.post({ type: "checkout", target, detach }),
        onPush: () => host.post({ type: "push" }),
      }),
    );
  }

  function render(state: ViewState): void {
    latest = state;
    applyTheme(state.theme);
    if (state.commits) {
      mount(state.commits, state);
      return;
    }
    const log = state.log ?? "";
    if (log === parsedLog) {
      mount(parsedCommits, state); // re-render (e.g. theme/repo change) without re-parsing
      return;
    }
    void parse(log).then((commits) => {
      parsedLog = log;
      parsedCommits = commits;
      if ((latest.log ?? "") === log && !latest.commits) mount(commits, latest);
    });
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
