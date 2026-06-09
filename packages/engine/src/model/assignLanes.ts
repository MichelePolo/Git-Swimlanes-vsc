import type { CommitNode, LaneModel, ViewConfig } from "@michelepolo/git-swimlanes-contract";
import { LAYOUT } from "../layout.js";

/** Deterministic default ordering: main/master first, then develop/dev, then alphabetical. */
function priority(name: string): [number, string] {
  if (name === "main" || name === "master") return [0, name];
  if (name === "develop" || name === "dev") return [1, name];
  return [2, name];
}

/**
 * Assign stable swimlane columns via first-parent claiming, honoring the view config.
 * Pinned branches take the leftmost lanes (in pin order); hidden branches don't claim a lane
 * of their own — their commits collapse into one shared "hidden" lane. Commits no branch
 * reaches fall back to "(no branch ref)". With the default empty config the result is
 * identical to the previous behavior. See engine spec §4.3 / Phase 1 spec.
 */
export function assignLanes(
  commits: CommitNode[],
  byHash: Record<string, CommitNode>,
  config: ViewConfig = { pinned: [], hidden: [] },
): LaneModel {
  const { pinned, hidden } = config;

  // 1. Branch tips, deduping remote/local by base name (prefer local).
  const tips: Record<string, { name: string; tip: string; remote: boolean }> = {};
  for (const c of commits)
    for (const b of c.branches) {
      const norm = b.replace(/^origin\//, "");
      if (!(norm in tips)) tips[norm] = { name: norm, tip: c.hash, remote: b !== norm };
      else if (tips[norm].remote && b === norm) tips[norm] = { name: norm, tip: c.hash, remote: false };
    }
  const allTips = Object.values(tips);

  // 2. Partition: hidden branches never get their own lane.
  const visible = allTips.filter((b) => !hidden.includes(b.name));
  const hiddenTips = allTips.filter((b) => hidden.includes(b.name));

  // 3. Order visible: pinned first (by pin index), then the default priority.
  const orderKey = (name: string): [number, number, number, string] => {
    const pi = pinned.indexOf(name);
    if (pi !== -1) return [0, pi, 0, name];
    const [tier, n] = priority(name);
    return [1, 0, tier, n];
  };
  visible.sort((a, b) => {
    const ka = orderKey(a.name);
    const kb = orderKey(b.name);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || ka[3].localeCompare(kb[3]);
  });

  // 4. Claim visible lanes by first-parent walk.
  const laneOf: Record<string, number> = {};
  const branchOf: Record<string, string> = {};
  visible.forEach((b, lane) => {
    let cur: string | undefined = b.tip;
    while (cur && byHash[cur] && laneOf[cur] === undefined) {
      laneOf[cur] = lane;
      branchOf[cur] = b.name;
      cur = byHash[cur].parents[0];
    }
  });
  const laneNames = visible.map((b) => b.name);

  // 5. Hidden branches claim the remaining commits into ONE shared "hidden" lane.
  let hiddenLane: number | null = null;
  for (const b of hiddenTips) {
    let cur: string | undefined = b.tip;
    while (cur && byHash[cur] && laneOf[cur] === undefined) {
      if (hiddenLane === null) {
        hiddenLane = laneNames.length;
        laneNames.push("hidden");
      }
      laneOf[cur] = hiddenLane;
      branchOf[cur] = "hidden";
      cur = byHash[cur].parents[0];
    }
  }

  // 6. Fallback lane for commits no branch reaches.
  let extra: number | null = null;
  for (const c of commits) {
    if (laneOf[c.hash] === undefined) {
      if (extra === null) {
        extra = laneNames.length;
        laneNames.push("(no branch ref)");
      }
      laneOf[c.hash] = extra;
      branchOf[c.hash] = "(no branch ref)";
    }
  }

  const allBranches = [
    ...visible.map((b) => b.name),
    ...hiddenTips.map((b) => b.name).sort((a, b) => a.localeCompare(b)),
  ];

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
    allBranches,
  };
}
