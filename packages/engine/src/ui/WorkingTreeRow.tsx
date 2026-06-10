import type { WorkingTreeFile } from "@michelepolo/git-swimlanes-contract";
import { LAYOUT } from "../layout.js";

export interface WorkingTreeRowProps {
  files: WorkingTreeFile[];
  expanded: boolean;
  onToggle: () => void;
  graphW: number;
  nodeX: number; // x of the dashed node (HEAD lane)
}

/** Color + label for a working-tree status code. */
function fileStatus(code: string): { label: string; color: string } {
  switch (code) {
    case "A": return { label: "aggiunto", color: "#5fc77f" };
    case "M": return { label: "modificato", color: "#e8b04b" };
    case "D": return { label: "eliminato", color: "#e06c75" };
    case "R": return { label: "rinominato", color: "#b48ead" };
    case "C": return { label: "copiato", color: "#56b6c2" };
    case "?": return { label: "non tracciato", color: "#8a96a8" };
    default: return { label: "modifica", color: "#8a96a8" };
  }
}

/**
 * Pinned pseudo-row for the uncommitted working tree: a dashed node on HEAD's lane plus an
 * expandable list of changed files (staged/unstaged/untracked). Read-only — see Phase 2 spec.
 */
export function WorkingTreeRow({ files, expanded, onToggle, graphW, nodeX }: WorkingTreeRowProps): JSX.Element {
  const cy = LAYOUT.rowH / 2;
  return (
    <div className="wt-band">
      <svg className="wt-graph" width={graphW} height={LAYOUT.rowH}>
        <line x1={nodeX} y1={cy} x2={nodeX} y2={LAYOUT.rowH} stroke="#8a96a8" strokeWidth={2} strokeDasharray="3 3" />
        <circle cx={nodeX} cy={cy} r={LAYOUT.dotR} fill="var(--bg)" stroke="#8a96a8" strokeWidth={2} strokeDasharray="3 2" />
      </svg>
      <div className="wt-rows">
        <div
          className="crow wt-row"
          role="button"
          tabIndex={0}
          style={{ height: LAYOUT.rowH }}
          onClick={onToggle}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
        >
          <span className="caret">{expanded ? "▾" : "▸"}</span>
          <span className="subj">Modifiche non committate ({files.length})</span>
        </div>
        {expanded && (
          <div className="files">
            {files.map((f) => {
              const staged = f.index !== " " && f.index !== "?";
              const code = f.index === "?" ? "?" : staged ? f.index : f.worktree;
              const st = fileStatus(code);
              const where = f.index === "?" ? "untracked" : staged ? "staged" : "unstaged";
              return (
                <div key={f.path} className="frow" data-path={f.path}>
                  <span className="fbadge" style={{ color: st.color, borderColor: st.color }} title={st.label}>
                    {code}
                  </span>
                  <span className="fpath">
                    {f.old ? <>{f.old} <span className="arr">→</span> {f.path}</> : f.path}
                  </span>
                  <span className="fopen">{where}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
