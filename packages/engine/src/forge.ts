/**
 * Map a git remote URL to the fetch refspec that pulls the forge's pull/merge-request
 * refs into `refs/remotes/origin/{pr,mr}/*`, so they appear as labeled lanes (spec §7.2).
 * Returns null for an unrecognized host. PR auth is handled by git's own credentials.
 */
export function pullRefspecFor(remoteUrl: string): string | null {
  const url = remoteUrl.toLowerCase();
  if (url.includes("github.com")) return "+refs/pull/*/head:refs/remotes/origin/pr/*";
  if (url.includes("dev.azure.com") || url.includes("visualstudio.com")) {
    return "+refs/pull/*/merge:refs/remotes/origin/pr/*";
  }
  if (url.includes("gitlab")) return "+refs/merge-requests/*/head:refs/remotes/origin/mr/*";
  if (url.includes("bitbucket.org")) return "+refs/pull-requests/*/from:refs/remotes/origin/pr/*";
  return null;
}
