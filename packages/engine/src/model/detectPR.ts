import type { PullRequestRef } from "@michelepolo/git-swimlanes-contract";

/** Infer a pull/merge request reference from a commit subject. See engine spec §4.4. */
export function detectPR(_subject: string): PullRequestRef | null {
  // TODO (spec §4.4): match Azure DevOps / GitHub / Bitbucket / GitLab / squash patterns.
  throw new Error("detectPR: not implemented (see git-swimlanes-spec.md §4.4)");
}
