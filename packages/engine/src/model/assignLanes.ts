import type { CommitNode, LaneModel } from "@michelepolo/git-swimlanes-contract";
import { LAYOUT } from "../layout.js";

/** Deterministic branch ordering: main/master first, then develop/dev, then alphabetical. */
function priority(name: string): [number, string] {
  if (name === "main" || name === "master") return [0, name];
  if (name === "develop" || name === "dev") return [1, name];
  return [2, name];
}

/**
 * Assign stable swimlane columns via first-parent claiming. See engine spec §4.3.
 *
 * Each branch claims a column by walking the first-parent chain from its tip, in a
 * deterministic priority order. Because a merge commit's first-parent is the prior tip
 * of the *target* branch, the target's walk never strays into the merged branch — so
 * lanes stay stable. Commits no ref can reach fall back to a "(no branch ref)" lane.
 */
export function assignLanes(
  commits: CommitNode[],
  byHash: Record<string, CommitNode>,
): LaneModel {
  // 1. Collect branch tips, deduping remote/local by base name (prefer local).
  const tips: Record<string, { name: string; tip: string; remote: boolean }> = {};
  for (const c of commits) {
    for (const b of c.branches) {
      const norm = b.replace(/^origin\//, "");
      if (!(norm in tips)) tips[norm] = { name: norm, tip: c.hash, remote: b !== norm };
      else if (tips[norm].remote && b === norm) tips[norm] = { name: norm, tip: c.hash, remote: false };
    }
  }

  // 2. Deterministic order: main, develop, then alphabetical.
  const branches = Object.values(tips).sort((a, b) => {
    const pa = priority(a.name);
    const pb = priority(b.name);
    return pa[0] - pb[0] || pa[1].localeCompare(pb[1]);
  });

  // 3. Claim lanes by first-parent walk, in priority order.
  const laneOf: Record<string, number> = {};
  const branchOf: Record<string, string> = {};
  branches.forEach((b, lane) => {
    let cur: string | undefined = b.tip;
    while (cur && byHash[cur] && laneOf[cur] === undefined) {
      laneOf[cur] = lane;
      branchOf[cur] = b.name;
      cur = byHash[cur].parents[0]; // first-parent
    }
  });

  // 4. Fallback lane for commits reached by no ref (e.g. a merged-and-deleted branch).
  let extra: number | null = null;
  for (const c of commits) {
    if (laneOf[c.hash] === undefined) {
      if (extra === null) extra = branches.length;
      laneOf[c.hash] = extra;
      branchOf[c.hash] = "(no branch ref)";
    }
  }

  const laneNames = branches.map((b) => b.name);
  if (extra !== null) laneNames.push("(no branch ref)");

  const rowOf: Record<string, number> = {};
  commits.forEach((c, i) => (rowOf[c.hash] = i));

  return {
    commits,
    byHash,
    laneOf,
    branchOf,
    laneNames,
    nLanes: laneNames.length,
    rowOf,
    graphW: LAYOUT.LP + laneNames.length * LAYOUT.laneW + LAYOUT.RP,
  };
}
