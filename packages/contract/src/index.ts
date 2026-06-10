// ─── Git data model (engine spec §2.2) ───────────────────────────────────────

/** File status code from `git --name-status` (R/C carry a similarity score). */
export type FileStatusCode =
  | "A" | "M" | "D" | "T" | "U" | "B"
  | `R${number}` | `C${number}`;

export interface FileChange {
  code: FileStatusCode;
  path: string;
  old?: string; // previous path, only for R/C
}

/** A parsed commit — node of the DAG. */
export interface CommitNode {
  hash: string;
  parents: string[]; // parents[0] = first-parent
  author: string;
  date: string; // ISO short, e.g. "2024-01-18"
  subject: string;
  branches: string[];
  tags: string[];
  head: boolean;
  files: FileChange[];
}

/** Result of the topological computation (independent of UI expansion). */
export interface LaneModel {
  commits: CommitNode[];
  byHash: Record<string, CommitNode>;
  laneOf: Record<string, number>;
  branchOf: Record<string, string>;
  laneNames: string[];
  nLanes: number;
  rowOf: Record<string, number>;
  graphW: number;
  /** All branch names present (visible + hidden), for the Branches panel. */
  allBranches: string[];
}

export interface DiffRequest { hash: string; path: string; oldPath?: string; }
export interface DiffResult { unified: string; }

export interface PullRequestRef {
  id: string;
  src: "Azure DevOps" | "GitHub" | "GitLab" | "Bitbucket" | "squash";
}

/** Theme overrides (engine spec §8). laneSaturation/laneLightness drive lane colors. */
export interface Theme {
  bg?: string; panel?: string; panel2?: string; line?: string;
  txt?: string; dim?: string; accent?: string;
  laneSaturation: number; laneLightness: number;
}

export interface SwimlanesOptions {
  newestFirst?: boolean;
  showLaneGuides?: boolean;
  detectPullRequests?: boolean;
  multiExpand?: boolean;
}

/** A selectable Git repository (for multi-repo workspaces/projects). */
export interface RepoRef {
  id: string;     // stable identifier (e.g. absolute root path)
  label: string;  // human-friendly name (e.g. folder name)
}

/** Per-repo view configuration (pin/hide branches). Names are normalized (no `origin/`). */
export interface ViewConfig {
  pinned: string[]; // branch names, in pin order (leftmost → right)
  hidden: string[]; // branch names to collapse into the "hidden" lane
}

/** A changed file in the working tree (`git status --porcelain`). */
export interface WorkingTreeFile {
  path: string;
  index: string;    // staged code (X): ' ' M A D R C U ?
  worktree: string; // unstaged code (Y): ' ' M A D R C U ?
  old?: string;     // previous path, for rename/copy
}

// ─── Host ↔ webview message protocol (vscode §2 / intellij §2) ────────────────

/** Webview → Host. */
export type Wv2Host =
  | { type: "ready" }
  | { type: "requestDiff"; reqId: string; hash: string; path: string; oldPath?: string }
  | { type: "commitSelected"; hash: string }
  | { type: "openFile"; path: string; hash: string }
  | { type: "selectRepo"; id: string }
  | { type: "fetchPullRefs" }
  | { type: "setViewConfig"; config: ViewConfig }
  | { type: "pull" }
  | { type: "fetch" }
  | { type: "createBranch"; hash: string }
  | { type: "createTag"; hash: string }
  | { type: "deleteBranch"; name: string }
  | { type: "deleteTag"; name: string }
  | { type: "checkout"; target: string; detach: boolean }
  | { type: "push" };

/** Host → Webview. */
export type Host2Wv =
  | { type: "init"; commits: CommitNode[]; theme: Theme }
  | { type: "setLog"; log: string }
  | { type: "diffResult"; reqId: string; unified: string }
  | { type: "diffError"; reqId: string; message: string }
  | { type: "theme"; theme: Theme }
  | { type: "repos"; repos: RepoRef[]; current: string }
  | { type: "viewConfig"; config: ViewConfig }
  | { type: "status"; porcelain: string };
