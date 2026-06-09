import type { WorkingTreeFile } from "@michelepolo/git-swimlanes-contract";

/**
 * Parse `git status --porcelain` (v1) output. Each line is `XY<space><path>`, where X is the
 * staged (index) code and Y the unstaged (worktree) code; renames/copies use `old -> new`.
 */
export function parseStatus(text: string): WorkingTreeFile[] {
  const files: WorkingTreeFile[] = [];
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (raw.length < 4) continue; // need at least "XY p"
    const index = raw[0];
    const worktree = raw[1];
    const rest = raw.slice(3);
    if (index === "R" || index === "C" || worktree === "R" || worktree === "C") {
      const [old, path] = rest.split(" -> ");
      files.push({ index, worktree, old, path: path ?? old });
    } else {
      files.push({ index, worktree, path: rest });
    }
  }
  return files;
}
