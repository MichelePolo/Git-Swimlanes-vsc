// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { parseLog } from "../src/model/parseLog.js";
import { assignLanes } from "../src/model/assignLanes.js";
import { detectPR } from "../src/model/detectPR.js";
import { colorFor } from "../src/model/color.js";
import { computeOffsets } from "../src/layout.js";
import { Graph } from "../src/ui/Graph.js";

afterEach(cleanup);

//  main:     m1 (merge of feature/login; PR #1)   ← lane 0
//            |\
//  feature:  | f1                                  ← lane 1
//            |/
//  base:     m0
const LOG = [
  "m1|m0 f1|HEAD -> main|A|2024-01-03|Merge pull request #1 from feature/login",
  "f1|m0|feature/login|A|2024-01-02|Add login",
  "m0|||A|2024-01-01|Base",
].join("\n");

function setup(showLaneGuides = true) {
  const { commits, byHash } = parseLog(LOG);
  const model = assignLanes(commits, byHash);
  const offsets = computeOffsets(model, new Set());
  const prHashes = new Set(commits.filter((c) => detectPR(c.subject)).map((c) => c.hash));
  return render(<Graph model={model} offsets={offsets} prHashes={prHashes} showLaneGuides={showLaneGuides} />);
}

describe("Graph (spec §5.1)", () => {
  it("sizes the svg to graphW × totalH", () => {
    const { container } = setup();
    const { commits, byHash } = parseLog(LOG);
    const model = assignLanes(commits, byHash);
    const { totalH } = computeOffsets(model, new Set());
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe(String(model.graphW));
    expect(svg.getAttribute("height")).toBe(String(totalH));
  });

  it("draws one lane guide per lane, and none when disabled", () => {
    expect(setup(true).container.querySelectorAll(".lane-guide")).toHaveLength(2);
    expect(setup(false).container.querySelectorAll(".lane-guide")).toHaveLength(0);
  });

  it("draws one node per commit", () => {
    const { container } = setup();
    expect(container.querySelectorAll("[data-node]")).toHaveLength(3);
  });

  it("renders a merge node as a donut (a hole) and normal nodes without one", () => {
    const { container } = setup();
    expect(container.querySelector('[data-node="m1"]')!.classList.contains("merge")).toBe(true);
    expect(container.querySelectorAll(".node-hole")).toHaveLength(1); // only the merge m1
    expect(container.querySelector('[data-node="f1"]')!.classList.contains("merge")).toBe(false);
  });

  it("draws a PR halo only on commits with a detected PR", () => {
    const { container } = setup();
    const halos = container.querySelectorAll(".pr-halo");
    expect(halos).toHaveLength(1);
    expect(halos[0].getAttribute("data-halo")).toBe("m1");
  });

  it("draws an edge per resolvable parent: same-lane as a line, cross-lane as a path", () => {
    const { container } = setup();
    // edges: m1→m0 (same lane, line), m1→f1 (cross, path), f1→m0 (cross, path)
    expect(container.querySelectorAll(".edge")).toHaveLength(3);
    expect(container.querySelectorAll("line.edge")).toHaveLength(1);
    expect(container.querySelectorAll("path.edge")).toHaveLength(2);
  });

  it("colors the first-parent edge with the child's branch color", () => {
    const { container } = setup();
    // The single same-lane edge is m1→m0 (first-parent), so it carries main's color.
    expect(container.querySelector("line.edge")!.getAttribute("stroke")).toBe(colorFor("main"));
  });

  it("keeps an edge that spans the window even when both endpoints are outside it", () => {
    // c0 is a merge whose 2nd parent is c8: a long edge from row 0 to row 8.
    const SPAN = [
      "c0|c1 c8|HEAD -> main|A|2024-01-10|merge",
      "c1|c2||A|2024-01-09|c1", "c2|c3||A|2024-01-08|c2", "c3|c4||A|2024-01-07|c3",
      "c4|c5||A|2024-01-06|c4", "c5|c6||A|2024-01-05|c5", "c6|c7||A|2024-01-04|c6",
      "c7|c8||A|2024-01-03|c7", "c8|c9||A|2024-01-02|c8", "c9|||A|2024-01-01|c9",
    ].join("\n");
    const { commits, byHash } = parseLog(SPAN);
    const model = assignLanes(commits, byHash);
    const offsets = computeOffsets(model, new Set());
    const { container } = render(<Graph model={model} offsets={offsets} range={[4, 7]} />);
    // Rows 0 and 8 are off-window, but the c0→c8 edge crosses rows 4..6, so it must render.
    expect(container.querySelector('[data-edge="c0-c8"]')).not.toBeNull();
  });
});
