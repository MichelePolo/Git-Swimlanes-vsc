import { useEffect } from "react";
import type { DiffRequest } from "@michelepolo/git-swimlanes-contract";
import { classifyDiffLine } from "../diff.js";

/** Lifecycle of one diff request, owned by the orchestrator. */
export type DiffState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "result"; unified: string };

export interface DiffModalProps {
  req: DiffRequest;
  state: DiffState;
  onClose: () => void;
}

/** Modal diff viewer with per-line classification. See engine spec §5.3. */
export function DiffModal({ req, state, onClose }: DiffModalProps): JSX.Element {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="diffmodal" role="dialog" aria-modal="true">
      <div className="diffcard">
        <div className="diffhead">
          <span className="difftitle mono">{req.path}</span>
          <button type="button" aria-label="Chiudi diff" title="Chiudi (Esc)" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="diffbody mono">
          {state.status === "loading" && <div className="diffinfo">Caricamento del diff…</div>}
          {state.status === "error" && <div className="diffinfo diffinfo--error">{state.message}</div>}
          {state.status === "result" &&
            state.unified.split("\n").map((line, i) => {
              const kind = classifyDiffLine(line);
              return (
                <span key={i} className={kind === "ctx" ? "dline" : `dline ${kind}`}>
                  {line}
                </span>
              );
            })}
        </div>
      </div>
    </div>
  );
}
