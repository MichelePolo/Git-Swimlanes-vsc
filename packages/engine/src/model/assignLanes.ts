import type { CommitNode, LaneModel } from "@michelepolo/git-swimlanes-contract";

/** Assign stable swimlane columns via first-parent claiming. See engine spec §4.3. */
export function assignLanes(
  _commits: CommitNode[],
  _byHash: Record<string, CommitNode>,
): LaneModel {
  // TODO (spec §4.3): tip dedup, deterministic ordering, first-parent claim, fallback lane.
  throw new Error("assignLanes: not implemented (see git-swimlanes-spec.md §4.3)");
}
