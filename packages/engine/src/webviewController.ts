import type {
  CommitNode,
  DiffRequest,
  DiffResult,
  Host2Wv,
  RepoRef,
  Theme,
  ViewConfig,
  Wv2Host,
} from "@michelepolo/git-swimlanes-contract";

/** What the engine needs from its host transport: a one-way message sink. */
export interface HostBridge {
  post(msg: Wv2Host): void;
}

/** The data the view renders from. Either `log` (raw) or `commits` (pre-parsed). */
export interface ViewState {
  log?: string;
  commits?: CommitNode[];
  theme?: Theme;
  repos?: RepoRef[];
  currentRepo?: string;
  viewConfig?: ViewConfig;
  status?: string;
}

export interface Controller {
  /** Called by the component; posts a requestDiff and resolves on the correlated reply. */
  requestDiff(req: DiffRequest): Promise<DiffResult>;
  /** Called by the host transport for every inbound message. */
  receive(msg: Host2Wv): void;
}

/**
 * Routes messages between the host and the engine, independent of the DOM.
 *
 * Diff requests are correlated to their replies by a monotonic `reqId`, so multiple
 * in-flight diffs never cross. State changes (init/setLog/theme) are pushed to
 * `onState`, which the caller uses to re-render.
 */
export function createController(host: HostBridge, onState: (s: ViewState) => void): Controller {
  let state: ViewState = { log: "" };
  let seq = 0;
  const pending = new Map<string, { resolve: (r: DiffResult) => void; reject: (e: Error) => void }>();

  function emit(next: ViewState): void {
    state = next;
    onState(state);
  }

  return {
    requestDiff(req: DiffRequest): Promise<DiffResult> {
      const reqId = `d${++seq}`;
      return new Promise<DiffResult>((resolve, reject) => {
        pending.set(reqId, { resolve, reject });
        host.post({ type: "requestDiff", reqId, hash: req.hash, path: req.path, oldPath: req.oldPath });
      });
    },

    receive(msg: Host2Wv): void {
      switch (msg.type) {
        case "init":
          emit({ ...state, commits: msg.commits, log: undefined, theme: msg.theme });
          break;
        case "setLog":
          emit({ ...state, log: msg.log, commits: undefined });
          break;
        case "theme":
          emit({ ...state, theme: msg.theme });
          break;
        case "repos":
          emit({ ...state, repos: msg.repos, currentRepo: msg.current });
          break;
        case "viewConfig":
          emit({ ...state, viewConfig: msg.config });
          break;
        case "status":
          emit({ ...state, status: msg.porcelain });
          break;
        case "diffResult": {
          const p = pending.get(msg.reqId);
          if (p) {
            pending.delete(msg.reqId);
            p.resolve({ unified: msg.unified });
          }
          break;
        }
        case "diffError": {
          const p = pending.get(msg.reqId);
          if (p) {
            pending.delete(msg.reqId);
            p.reject(new Error(msg.message));
          }
          break;
        }
      }
    },
  };
}
