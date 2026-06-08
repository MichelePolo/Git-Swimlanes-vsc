import { describe, it, expect } from "vitest";
import { parseLog } from "../src/model/parseLog.js";
import { assignLanes } from "../src/model/assignLanes.js";
import { LAYOUT, laneX, panelHeight, computeOffsets } from "../src/layout.js";

// c3 has 3 files; c2 and c1 have none. No branches → all in the fallback lane,
// which is irrelevant to vertical layout (the thing under test here).
const LOG = [
  "c3|c2||A|2024-01-03|c three",
  "M\ta.ts",
  "M\tb.ts",
  "M\tc.ts",
  "c2|c1||A|2024-01-02|c two",
  "c1|||A|2024-01-01|c one",
].join("\n");

function model() {
  const { commits, byHash } = parseLog(LOG);
  return assignLanes(commits, byHash);
}

describe("laneX (existing)", () => {
  it("centers lane i within its column", () => {
    expect(laneX(0)).toBe(LAYOUT.LP + LAYOUT.laneW / 2);
    expect(laneX(1)).toBe(LAYOUT.LP + LAYOUT.laneW + LAYOUT.laneW / 2);
  });
});

describe("panelHeight (spec §4.5)", () => {
  it("uses a single line of height for a commit with no files", () => {
    const { byHash } = parseLog(LOG);
    expect(panelHeight(byHash["c2"])).toBe(18 + 1 * 24); // padV + 1*lineH = 42
  });

  it("grows with the number of files", () => {
    const { byHash } = parseLog(LOG);
    expect(panelHeight(byHash["c3"])).toBe(18 + 3 * 24); // 90
  });

  it("caps very tall panels at 250px", () => {
    const many = ["big||| A|2024|big", ...Array.from({ length: 100 }, (_, i) => `M\tf${i}.ts`)].join("\n");
    const { byHash } = parseLog(many);
    expect(panelHeight(byHash["big"])).toBe(250);
  });
});

describe("computeOffsets (spec §4.5)", () => {
  it("stacks rows by rowH when nothing is expanded", () => {
    const m = model();
    const { top, totalH, dotY } = computeOffsets(m, new Set());
    expect(top).toEqual([0, LAYOUT.rowH, 2 * LAYOUT.rowH]);
    expect(totalH).toBe(3 * LAYOUT.rowH);
    expect(dotY(0)).toBe(LAYOUT.rowH / 2);
  });

  it("pushes later rows down by the expanded panel's height", () => {
    const m = model();
    const { top, totalH } = computeOffsets(m, new Set(["c3"])); // c3 is the first row
    expect(top[0]).toBe(0);
    expect(top[1]).toBe(LAYOUT.rowH + (18 + 3 * 24)); // 46 + 90 = 136
    expect(top[2]).toBe(top[1] + LAYOUT.rowH);
    expect(totalH).toBe(top[2] + LAYOUT.rowH);
  });
});
