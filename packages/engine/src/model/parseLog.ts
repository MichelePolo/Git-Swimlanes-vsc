import type { CommitNode, FileChange, FileStatusCode } from "@michelepolo/git-swimlanes-contract";

/** A git file-status line: a status code (optionally with a score) then a tab. */
const FILE_LINE = /^[ACDMRTUXB]\d*\t/;

/**
 * Parse the `%D` refs field of one commit into branches/tags/head.
 *
 * `refs` is the comma-separated decoration string git emits, e.g.
 *   "HEAD -> main, origin/main, tag: v1.0"
 * Rules (engine spec §4.1):
 *   - "tag: <name>"       → a tag (strip the "tag: " prefix)
 *   - "HEAD -> <branch>"  → head = true AND <branch> is a branch
 *   - "HEAD"  (bare)      → head = true, no branch
 *   - anything else       → a branch name
 * Entries are comma-separated; trim each, and skip empty entries.
 *
 * TODO (learning-mode contribution): implement this.
 */
function parseRefs(refs: string): { branches: string[]; tags: string[]; head: boolean } {
  const branches: string[] = [];
  const tags: string[] = [];
  let head = false;

  for (let r of refs.split(",")) {
    r = r.trim();
    if (!r) continue;
    if (r.startsWith("tag: ")) tags.push(r.slice(5).trim());
    else if (r.includes("HEAD -> ")) {
      head = true;
      branches.push(r.split("->")[1].trim());
    } else if (r === "HEAD") head = true;
    else branches.push(r);
  }

  return { branches, tags, head };
}

/** Parse `git log --name-status` output into commit nodes. See engine spec §4.1. */
export function parseLog(
  text: string,
): { commits: CommitNode[]; byHash: Record<string, CommitNode> } {
  const commits: CommitNode[] = [];
  const byHash: Record<string, CommitNode> = {};
  let current: CommitNode | null = null;

  for (const raw of text.replace(/\r/g, "").split("\n")) {
    if (!raw.trim()) continue;

    // (1) file-status line — belongs to the commit currently being built.
    if (FILE_LINE.test(raw)) {
      if (!current) continue;
      const p = raw.split("\t");
      const code = p[0] as FileStatusCode;
      const change: FileChange =
        code[0] === "R" || code[0] === "C"
          ? { code, old: p[1], path: p[2] ?? p[1] }
          : { code, path: p[1] };
      current.files.push(change);
      continue;
    }

    // (2) header line — must contain the field separator.
    if (!raw.includes("|")) continue;
    const [hash, parents = "", refs = "", author = "", date = "", ...rest] = raw.split("|");
    const { branches, tags, head } = parseRefs(refs);
    const c: CommitNode = {
      hash: hash.trim(),
      parents: parents.trim() ? parents.trim().split(/\s+/) : [],
      author: author.trim(),
      date: date.trim(),
      subject: rest.join("|").trim(),
      branches,
      tags,
      head,
      files: [],
    };
    commits.push(c);
    byHash[c.hash] = c;
    current = c;
  }

  return { commits, byHash };
}
