import { useMemo, useState } from "react";
import type {
  CommitNode,
  DiffRequest,
  DiffResult,
  FileChange,
  PullRequestRef,
  SwimlanesOptions,
  Theme,
} from "@michelepolo/git-swimlanes-contract";
import { parseLog } from "../model/parseLog.js";
import { assignLanes } from "../model/assignLanes.js";
import { detectPR } from "../model/detectPR.js";
import { computeOffsets } from "../layout.js";
import { Graph } from "./Graph.js";
import { LaneHeader } from "./LaneHeader.js";
import { Row } from "./Row.js";
import { DiffModal, type DiffState } from "./DiffModal.js";

export interface GitSwimlanesProps {
  log?: string;
  commits?: CommitNode[];
  options?: SwimlanesOptions;
  theme?: Partial<Theme>;
  onCommitToggle?(hash: string, expanded: boolean): void;
  onCommitSelect?(commit: CommitNode): void;
  onFileSelect?(req: DiffRequest): void;
  onRequestDiff?(req: DiffRequest): Promise<DiffResult>;
}

const DEFAULTS: Required<SwimlanesOptions> = {
  newestFirst: true,
  showLaneGuides: true,
  detectPullRequests: true,
  multiExpand: true,
};

/**
 * Deterministic Git history visualizer. Composes the SVG graph and the HTML rows
 * over a shared vertical-offset model, and drives the on-demand diff viewer. See
 * engine spec §5–§6.
 */
export function GitSwimlanes(props: GitSwimlanesProps): JSX.Element {
  const { log, commits: commitsProp, options, onCommitToggle, onCommitSelect, onFileSelect, onRequestDiff } = props;
  const opts = { ...DEFAULTS, ...options };

  // Topology runs once per input; expansion-independent.
  const model = useMemo(() => {
    const parsed = commitsProp
      ? { commits: commitsProp, byHash: Object.fromEntries(commitsProp.map((c) => [c.hash, c])) }
      : parseLog(log ?? "");
    return assignLanes(parsed.commits, parsed.byHash);
  }, [log, commitsProp]);

  const prByHash = useMemo(() => {
    const map: Record<string, PullRequestRef | null> = {};
    if (opts.detectPullRequests) for (const c of model.commits) map[c.hash] = detectPR(c.subject);
    return map;
  }, [model, opts.detectPullRequests]);
  const prHashes = useMemo(
    () => new Set(Object.entries(prByHash).filter(([, v]) => v).map(([h]) => h)),
    [prByHash],
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const offsets = useMemo(() => computeOffsets(model, expanded), [model, expanded]);

  const [diff, setDiff] = useState<{ req: DiffRequest; state: DiffState } | null>(null);

  function toggle(hash: string): void {
    const willExpand = !expanded.has(hash);
    setExpanded((prev) => {
      const next = new Set(opts.multiExpand ? prev : []);
      if (prev.has(hash)) next.delete(hash);
      else next.add(hash);
      return next;
    });
    onCommitToggle?.(hash, willExpand);
    const c = model.byHash[hash];
    if (c) onCommitSelect?.(c);
  }

  function selectFile(commit: CommitNode, file: FileChange): void {
    const req: DiffRequest = { hash: commit.hash, path: file.path, oldPath: file.old };
    onFileSelect?.(req);
    if (!onRequestDiff) return;
    setDiff({ req, state: { status: "loading" } });
    onRequestDiff(req).then(
      (res) => setDiff({ req, state: { status: "result", unified: res.unified } }),
      (err: unknown) => setDiff({ req, state: { status: "error", message: String((err as Error)?.message ?? err) } }),
    );
  }

  return (
    <div className="git-swimlanes">
      <div className="sw-head">
        <LaneHeader model={model} />
        <div className="sw-rows-head" />
      </div>
      <div className="sw-body">
        <Graph model={model} offsets={offsets} prHashes={prHashes} showLaneGuides={opts.showLaneGuides} />
        <div className="sw-rows">
          {model.commits.map((c) => (
            <Row
              key={c.hash}
              commit={c}
              pr={prByHash[c.hash] ?? null}
              expanded={expanded.has(c.hash)}
              onToggle={() => toggle(c.hash)}
              onFileSelect={(f) => selectFile(c, f)}
            />
          ))}
        </div>
      </div>
      {diff && <DiffModal req={diff.req} state={diff.state} onClose={() => setDiff(null)} />}
    </div>
  );
}
