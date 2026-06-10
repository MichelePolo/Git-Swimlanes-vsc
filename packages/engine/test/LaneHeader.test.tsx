// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { LaneModel } from "@michelepolo/git-swimlanes-contract";
import { parseLog } from "../src/model/parseLog.js";
import { assignLanes } from "../src/model/assignLanes.js";
import { laneX } from "../src/layout.js";
import { LaneHeader } from "../src/ui/LaneHeader.js";

afterEach(cleanup);

// main, develop, feature/login, plus one very long branch name — all off the root.
const LOG = [
  "m1|r0|HEAD -> main|A|2024-01-05|main work",
  "d1|r0|develop|A|2024-01-04|dev work",
  "f1|r0|feature/login|A|2024-01-03|feature work",
  "x1|r0|feature/this-is-a-really-long-branch-name|A|2024-01-02|x",
  "r0|||A|2024-01-01|root",
].join("\n");

function model() {
  const { commits, byHash } = parseLog(LOG);
  return assignLanes(commits, byHash);
}

describe("LaneHeader (spec §1 — persistent lane labels)", () => {
  it("renders one label per lane", () => {
    const { container } = render(<LaneHeader model={model()} />);
    expect(container.querySelectorAll(".lane-label")).toHaveLength(model().laneNames.length);
  });

  it("labels each lane with its branch name", () => {
    const { container } = render(<LaneHeader model={model()} />);
    expect(container.querySelector('.lane-label[data-lane-label="main"]')).not.toBeNull();
    expect(container.querySelector('.lane-label[data-lane-label="develop"]')).not.toBeNull();
    expect(container.querySelector('.lane-label[data-lane-label="feature/login"]')).not.toBeNull();
  });

  it("positions each label at its lane's x coordinate", () => {
    const m = model();
    const { container } = render(<LaneHeader model={m} />);
    const developIndex = m.laneNames.indexOf("develop");
    const label = container.querySelector<HTMLElement>('.lane-label[data-lane-label="develop"]')!;
    expect(label.style.left).toBe(`${laneX(developIndex)}px`);
  });

  it("truncates names longer than 18 chars to 17 + ellipsis", () => {
    const { container } = render(<LaneHeader model={model()} />);
    const long = container.querySelector<HTMLElement>(
      '.lane-label[data-lane-label="feature/this-is-a-really-long-branch-name"]',
    )!;
    expect(long.textContent).toBe("feature/this-is-a" + "…");
    expect(long.textContent!.length).toBe(18);
  });

  it("draws a tick per lane too", () => {
    const { container } = render(<LaneHeader model={model()} />);
    expect(container.querySelectorAll(".lane-tick")).toHaveLength(model().laneNames.length);
  });
});

const simpleModel = { laneNames: ["main", "feature"], graphW: 120 } as unknown as LaneModel;

describe("LaneHeader context-menu hook", () => {
  it("calls onLaneContextMenu with the lane name on right-click", () => {
    const onLaneContextMenu = vi.fn();
    const { container } = render(<LaneHeader model={simpleModel} onLaneContextMenu={onLaneContextMenu} />);
    const label = container.querySelector('.lane-label[data-lane-label="feature"]');
    fireEvent.contextMenu(label!);
    expect(onLaneContextMenu).toHaveBeenCalledTimes(1);
    expect(onLaneContextMenu.mock.calls[0][0]).toBe("feature");
  });
});
