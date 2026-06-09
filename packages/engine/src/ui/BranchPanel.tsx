import type { ViewConfig } from "@michelepolo/git-swimlanes-contract";
import { colorFor } from "../model/color.js";

export interface BranchPanelProps {
  /** Branch names present in the current log. */
  allBranches: string[];
  config: ViewConfig;
  onChange: (next: ViewConfig) => void;
}

function toggle(list: string[], name: string): string[] {
  return list.includes(name) ? list.filter((n) => n !== name) : [...list, name];
}

/** Per-branch pin/hide controls. Lists present branches plus any configured-but-absent ones. */
export function BranchPanel({ allBranches, config, onChange }: BranchPanelProps): JSX.Element {
  const configured = [...config.pinned, ...config.hidden];
  const absent = configured.filter((n) => !allBranches.includes(n));
  const rows = [...allBranches, ...Array.from(new Set(absent))];

  return (
    <div className="branch-panel">
      {rows.map((name) => {
        const isAbsent = !allBranches.includes(name);
        return (
          <div key={name} className={`brow${isAbsent ? " absent" : ""}`}>
            <span className="bname" style={{ color: isAbsent ? "var(--dim)" : colorFor(name) }}>
              {name}
            </span>
            {isAbsent && <span className="babsent">assente</span>}
            <button
              type="button"
              className={`btoggle${config.pinned.includes(name) ? " on" : ""}`}
              aria-label={`pin ${name}`}
              title="Fissa la corsia (pin)"
              onClick={() => onChange({ ...config, pinned: toggle(config.pinned, name) })}
            >
              📌
            </button>
            <button
              type="button"
              className={`btoggle${config.hidden.includes(name) ? " on" : ""}`}
              aria-label={`nascondi ${name}`}
              title="Nascondi il branch (hide)"
              onClick={() => onChange({ ...config, hidden: toggle(config.hidden, name) })}
            >
              🙈
            </button>
          </div>
        );
      })}
    </div>
  );
}
