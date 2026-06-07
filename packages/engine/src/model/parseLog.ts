import type { CommitNode } from "@michelepolo/git-swimlanes-contract";

/** Parse `git log --name-status` output into commit nodes. See engine spec §4.1. */
export function parseLog(
  _text: string,
): { commits: CommitNode[]; byHash: Record<string, CommitNode> } {
  // TODO (spec §4.1): implement line classification (file line vs header) and parsing.
  throw new Error("parseLog: not implemented (see git-swimlanes-spec.md §4.1)");
}
