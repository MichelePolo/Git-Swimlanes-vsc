import type { PullRequestRef } from "@michelepolo/git-swimlanes-contract";

/**
 * Infer a pull/merge request reference from a commit subject. See engine spec §4.4.
 *
 * A PR is not a Git object: it is inferred from the merge/squash message. Patterns
 * are tried in order of specificity — GitHub's "Merge pull request #N" must be tested
 * before Bitbucket's looser "pull request #N", which it would otherwise also match.
 */
export function detectPR(subject: string): PullRequestRef | null {
  let m: RegExpMatchArray | null;
  if ((m = subject.match(/^Merged PR (\d+)/i))) return { id: m[1], src: "Azure DevOps" };
  if ((m = subject.match(/Merge pull request #(\d+)/i))) return { id: m[1], src: "GitHub" };
  if ((m = subject.match(/\bpull request #(\d+)/i))) return { id: m[1], src: "Bitbucket" };
  if ((m = subject.match(/merge request[^!]*!(\d+)/i))) return { id: m[1], src: "GitLab" };
  if ((m = subject.match(/\(#(\d+)\)\s*$/))) return { id: m[1], src: "squash" };
  return null;
}
