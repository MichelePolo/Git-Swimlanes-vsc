import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type {
  CommitNode,
  DiffRequest,
  DiffResult,
  FileChange,
  PullRequestRef,
  RepoRef,
  SwimlanesOptions,
  Theme,
} from "@michelepolo/git-swimlanes-contract";
import { parseLog } from "../model/parseLog.js";
import { assignLanes } from "../model/assignLanes.js";
import { detectPR } from "../model/detectPR.js";
import { laneColorer } from "../model/color.js";
import { computeOffsets, visibleRange } from "../layout.js";
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
  /** Open the file in the host's editor (e.g. from the diff viewer). */
  onOpenFile?(req: DiffRequest): void;
  /** Initial set of expanded commit hashes (e.g. restored persisted UI state). */
  initialExpanded?: string[];
  /** Called whenever the expanded set changes, so the host can persist it. */
  onExpandedChange?(expanded: string[]): void;
  /** Selectable repositories (multi-repo workspaces); a selector shows when length > 1. */
  repos?: RepoRef[];
  currentRepo?: string;
  onSelectRepo?(id: string): void;
  /** Fetch the forge's PR/MR refs so they appear as lanes (spec §7.2). */
  onFetchPullRefs?(): void;
}

const DEFAULTS: Required<SwimlanesOptions> = {
  newestFirst: true,
  showLaneGuides: true,
  detectPullRequests: true,
  multiExpand: true,
};

/** Above this many commits the rows + graph render only the visible window (spec §9). */
const VIRTUALIZE_THRESHOLD = 400;

/**
 * Deterministic Git history visualizer. Composes the SVG graph and the HTML rows
 * over a shared vertical-offset model, and drives the on-demand diff viewer. See
 * engine spec §5–§6.
 */
export function GitSwimlanes(props: GitSwimlanesProps): JSX.Element {
  const {
    log,
    commits: commitsProp,
    options,
    onCommitToggle,
    onCommitSelect,
    onFileSelect,
    onRequestDiff,
    onOpenFile,
    initialExpanded,
    onExpandedChange,
    repos,
    currentRepo,
    onSelectRepo,
    onFetchPullRefs,
  } = props;
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

  // Lane colors follow the host theme's lightness/saturation (e.g. dimmer on light themes).
  const color = useMemo(() => laneColorer(props.theme), [props.theme]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(initialExpanded ?? []));
  const offsets = useMemo(() => computeOffsets(model, expanded), [model, expanded]);

  // Virtualization: render only the visible row window for large repos. The window math is
  // pure (visibleRange); here we only measure the scroll viewport. In environments without
  // layout (jsdom) viewportH stays 0, so everything renders — keeping behavior simple/testable.
  const scrollRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState({ scrollTop: 0, viewportH: 0 });
  useLayoutEffect(() => {
    const measure = (): void => {
      const el = scrollRef.current;
      if (el) setView((v) => ({ ...v, viewportH: el.clientHeight }));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [model]);
  const onScroll = (): void => {
    const el = scrollRef.current;
    if (el) setView({ scrollTop: el.scrollTop, viewportH: el.clientHeight });
  };
  const n = model.commits.length;
  const windowed = n > VIRTUALIZE_THRESHOLD && view.viewportH > 0;
  const [first, last] = windowed
    ? visibleRange(offsets.top, offsets.totalH, view.scrollTop, view.viewportH)
    : [0, n];

  const [diff, setDiff] = useState<{ req: DiffRequest; state: DiffState } | null>(null);
  // A commit's diff for a path is immutable, so cache by hash:path across the session.
  const diffCache = useRef(new Map<string, DiffResult>());

  function toggle(hash: string): void {
    const willExpand = !expanded.has(hash);
    const next = new Set(opts.multiExpand ? expanded : []);
    if (next.has(hash)) next.delete(hash);
    else next.add(hash);
    setExpanded(next);
    onExpandedChange?.([...next]);
    onCommitToggle?.(hash, willExpand);
    const c = model.byHash[hash];
    if (c) onCommitSelect?.(c);
  }

  function selectFile(commit: CommitNode, file: FileChange): void {
    const req: DiffRequest = { hash: commit.hash, path: file.path, oldPath: file.old };
    onFileSelect?.(req);
    if (!onRequestDiff) return;

    const key = `${req.hash}:${req.path}`;
    const cached = diffCache.current.get(key);
    if (cached) {
      setDiff({ req, state: { status: "result", unified: cached.unified } });
      return;
    }

    setDiff({ req, state: { status: "loading" } });
    onRequestDiff(req).then(
      (res) => {
        diffCache.current.set(key, res); // cache successes only — errors stay retryable
        setDiff({ req, state: { status: "result", unified: res.unified } });
      },
      (err: unknown) => setDiff({ req, state: { status: "error", message: String((err as Error)?.message ?? err) } }),
    );
  }

  return (
    <div className="git-swimlanes">
      {(onFetchPullRefs || (repos && repos.length > 1)) && (
        <div className="sw-toolbar">
          {repos && repos.length > 1 && (
            <select
              className="repo-select"
              aria-label="Repository"
              value={currentRepo ?? ""}
              onChange={(e) => onSelectRepo?.(e.target.value)}
            >
              {repos.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          )}
          {onFetchPullRefs && (
            <button
              type="button"
              className="sw-btn"
              aria-label="Scarica i ref delle pull request"
              title="Scarica i ref delle pull request"
              onClick={onFetchPullRefs}
            >
              ⤓ Pull request
            </button>
          )}
        </div>
      )}
      <div className="sw-head">
        <LaneHeader model={model} color={color} />
        <div className="sw-rows-head" />
      </div>
      <div className="sw-scroll" ref={scrollRef} onScroll={onScroll}>
        <div className="sw-body">
          <Graph
            model={model}
            offsets={offsets}
            prHashes={prHashes}
            showLaneGuides={opts.showLaneGuides}
            color={color}
            range={windowed ? [first, last] : undefined}
          />
          <div className="sw-rows" style={{ position: "relative", height: offsets.totalH }}>
            {model.commits.slice(first, last).map((c, j) => {
              const i = first + j;
              return (
                <div
                  key={c.hash}
                  className="sw-rowpos"
                  style={{ position: "absolute", top: offsets.top[i], left: 0, right: 0 }}
                >
                  <Row
                    commit={c}
                    pr={prByHash[c.hash] ?? null}
                    expanded={expanded.has(c.hash)}
                    onToggle={() => toggle(c.hash)}
                    onFileSelect={(f) => selectFile(c, f)}
                    color={color}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {diff && (
        <DiffModal
          req={diff.req}
          state={diff.state}
          onClose={() => setDiff(null)}
          onOpenFile={onOpenFile ? () => onOpenFile(diff.req) : undefined}
        />
      )}
    </div>
  );
}
