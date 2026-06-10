// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { WorkingTreeFile } from "@michelepolo/git-swimlanes-contract";
import { WorkingTreeRow } from "../src/ui/WorkingTreeRow.js";

afterEach(cleanup);

const files: WorkingTreeFile[] = [
  { index: "M", worktree: " ", path: "src/app.ts" },
  { index: " ", worktree: "M", path: "src/b.ts" },
  { index: "?", worktree: "?", path: "junk.log" },
];

function renderRow(over: Partial<Parameters<typeof WorkingTreeRow>[0]> = {}) {
  const onToggle = vi.fn();
  render(<WorkingTreeRow files={files} expanded={false} onToggle={onToggle} graphW={100} nodeX={30} {...over} />);
  return { onToggle };
}

describe("WorkingTreeRow", () => {
  it("shows the uncommitted-changes summary with the file count", () => {
    renderRow();
    expect(screen.getByText(/Modifiche non committate \(3\)/)).toBeInTheDocument();
  });

  it("hides the file list when collapsed and shows it when expanded", () => {
    renderRow({ expanded: false });
    expect(screen.queryByText("src/app.ts")).not.toBeInTheDocument();
    cleanup();
    renderRow({ expanded: true });
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("staged")).toBeInTheDocument();
    expect(screen.getByText("unstaged")).toBeInTheDocument();
    expect(screen.getByText("untracked")).toBeInTheDocument();
  });

  it("toggles on row click", () => {
    const { onToggle } = renderRow();
    fireEvent.click(screen.getByText(/Modifiche non committate/));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("draws a dashed HEAD-lane node", () => {
    const { container } = render(
      <WorkingTreeRow files={files} expanded={false} onToggle={() => {}} graphW={100} nodeX={30} />,
    );
    const node = container.querySelector("circle");
    expect(node).not.toBeNull();
    expect(node!.getAttribute("stroke-dasharray")).not.toBeNull();
  });

  it("labels an unmerged (U) file as a conflict", () => {
    render(
      <WorkingTreeRow
        files={[{ index: "U", worktree: "U", path: "src/c.ts" }]}
        expanded
        onToggle={() => {}}
        graphW={100}
        nodeX={30}
      />,
    );
    expect(screen.getByText("conflitto")).toBeInTheDocument(); // the staged/unstaged-style label
    expect(screen.getByText("U")).toBeInTheDocument(); // the badge
  });
});
