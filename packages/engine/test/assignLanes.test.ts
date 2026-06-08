import { describe, it, expect } from "vitest";
import type { CommitNode } from "@michelepolo/git-swimlanes-contract";
import { parseLog } from "../src/model/parseLog.js";
import { assignLanes } from "../src/model/assignLanes.js";

// Minimal DAG (newest first), built via parseLog so the fixture stays in the
// real wire format. Topology:
//
//   main:           m1 (merge of feature into main; first-parent = m0)
//                   |  \
//   feature/login:  |   f1
//   develop:        |   d1            (d1 and f1 both branch off m0)
//                    \ /
//   (base on main): m0  (root)
//   orphan:         x1  (no ref reaches it → fallback lane)
//
const LOG = [
  "m1|m0 f1|HEAD -> main|A|2024-01-05|Merge pull request #1 from feature/login",
  "f1|m0|feature/login|A|2024-01-04|Add login",
  "d1|m0|develop, origin/develop|A|2024-01-03|Dev work",
  "m0||  |A|2024-01-02|Base",
  "x1||  |A|2024-01-01|Orphan from a deleted branch",
].join("\n");

function model() {
  const { commits, byHash } = parseLog(LOG);
  return assignLanes(commits, byHash);
}

describe("assignLanes (spec §4.3)", () => {
  it("gives main lane 0 and develop lane 1", () => {
    const m = model();
    expect(m.laneNames[0]).toBe("main");
    expect(m.laneNames[1]).toBe("develop");
    expect(m.laneOf["m1"]).toBe(0);
    expect(m.laneOf["d1"]).toBe(1);
  });

  it("keeps feature commits in their own lane across a merge (first-parent)", () => {
    const m = model();
    // f1 is merged into main via m1, yet stays in the feature lane, not absorbed.
    expect(m.branchOf["f1"]).toBe("feature/login");
    expect(m.laneOf["f1"]).toBe(2);
    // The shared base m0 is claimed by main (first-parent walk from m1), not feature.
    expect(m.branchOf["m0"]).toBe("main");
    expect(m.laneOf["m0"]).toBe(0);
  });

  it("routes commits with no claiming ref into the (no branch ref) lane", () => {
    const m = model();
    expect(m.branchOf["x1"]).toBe("(no branch ref)");
    expect(m.laneNames).toContain("(no branch ref)");
    expect(m.laneOf["x1"]).toBe(m.laneNames.indexOf("(no branch ref)"));
  });

  it("dedups origin/<name> against local <name>, preferring local", () => {
    const m = model();
    expect(m.laneNames.filter((n: string) => n === "develop")).toHaveLength(1);
    expect(m.laneNames).not.toContain("origin/develop");
    expect(m.branchOf["d1"]).toBe("develop");
  });

  it("assigns row indices and graph width consistent with lane count", () => {
    const m = model();
    expect(m.nLanes).toBe(m.laneNames.length);
    expect(m.rowOf["m1"]).toBe(0); // newest first → row 0
    expect(m.graphW).toBeGreaterThan(0);
  });

  it("indexes every commit (no commit left without a lane)", () => {
    const m = model();
    const allHashes: string[] = m.commits.map((c: CommitNode) => c.hash);
    for (const h of allHashes) expect(typeof m.laneOf[h]).toBe("number");
  });
});
