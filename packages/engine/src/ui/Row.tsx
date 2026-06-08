import type { CommitNode, FileChange, PullRequestRef } from "@michelepolo/git-swimlanes-contract";
import { colorFor } from "../model/color.js";
import { LAYOUT, panelHeight } from "../layout.js";

export interface RowProps {
  commit: CommitNode;
  /** PR inferred from the subject, or null. Detection is the orchestrator's choice. */
  pr?: PullRequestRef | null;
  expanded: boolean;
  onToggle: () => void;
  onFileSelect: (file: FileChange) => void;
  /** Branch → color (theme-aware); defaults to the dark-tuned colorFor. */
  color?: (name: string) => string;
}

/** Color + human label for a file-status code (engine spec §5.2). */
function fileStatus(code: string): { label: string; color: string } {
  switch (code[0]) {
    case "A": return { label: "aggiunto", color: "#5fc77f" };
    case "M": return { label: "modificato", color: "#e8b04b" };
    case "D": return { label: "eliminato", color: "#e06c75" };
    case "R": return { label: "rinominato", color: "#b48ead" };
    case "C": return { label: "copiato", color: "#56b6c2" };
    case "T": return { label: "tipo file", color: "#8a96a8" };
    default: return { label: "modifica", color: "#8a96a8" };
  }
}

/** One commit row with its expandable file panel. See engine spec §5.2. */
export function Row({ commit, pr, expanded, onToggle, onFileSelect, color = colorFor }: RowProps): JSX.Element {
  const nf = commit.files.length;
  return (
    <div className="cwrap">
      <div
        className={`crow${expanded ? " open" : ""}`}
        data-hash={commit.hash}
        style={{ height: LAYOUT.rowH }}
        role="button"
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
      >
        <span className="caret">{expanded ? "▾" : "▸"}</span>
        <span className="hash">{commit.hash.slice(0, 7)}</span>

        {pr && (
          <span className={`pill pr${pr.src === "squash" ? " squash" : ""}`} title={`PR via message (${pr.src})`}>
            ⇲ PR #{pr.id}
          </span>
        )}
        {commit.branches.map((b, i) => {
          const norm = b.replace(/^origin\//, "");
          const isHead = commit.head && i === 0;
          return (
            <span
              key={b}
              className={`pill branch${isHead ? " head" : ""}`}
              style={{ background: color(norm), color: "#0c1016" }}
            >
              {b}
            </span>
          );
        })}
        {commit.tags.map((t) => (
          <span key={t} className="pill tag">⌑ {t}</span>
        ))}

        <span className="subj">{commit.subject || "—"}</span>
        {nf > 0 && <span className="fcount">⊞ {nf}</span>}
        <span className="who">{commit.author} · {commit.date}</span>
      </div>

      {expanded && (
        <div className="files" style={{ height: panelHeight(commit) }}>
          {nf === 0 ? (
            <div className="fempty">
              Nessun file elencato. Se è un merge, Git non mostra il diff di default;
              rigenera con --name-status (e per i merge aggiungi -m --first-parent).
            </div>
          ) : (
            commit.files.map((f) => {
              const st = fileStatus(f.code);
              return (
                <div
                  key={f.path}
                  className="frow"
                  data-hash={commit.hash}
                  data-path={f.path}
                  title="apri diff"
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileSelect(f);
                  }}
                >
                  <span className="fbadge" style={{ color: st.color, borderColor: st.color }} title={st.label}>
                    {f.code}
                  </span>
                  <span className="fpath">
                    {f.old ? <>{f.old} <span className="arr">→</span> {f.path}</> : f.path}
                  </span>
                  <span className="fopen">diff ›</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
