import type {
  CommitNode,
  DiffRequest,
  DiffResult,
  SwimlanesOptions,
  Theme,
} from "@michelepolo/git-swimlanes-contract";

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

/** Deterministic Git history visualizer. TODO (spec §5,§6): full SVG graph + rows + diff. */
export function GitSwimlanes(_props: GitSwimlanesProps): JSX.Element {
  // TODO (spec §3-§6): parse → assignLanes → layout → render SVG graph and HTML rows.
  return <div className="git-swimlanes" data-stub="true">Git Swimlanes (stub)</div>;
}
