// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { parseLog } from "../src/model/parseLog.js";
import { GitSwimlanes } from "../src/ui/GitSwimlanes.js";

afterEach(cleanup);

const LOG = [
  "m1|m0 f1|HEAD -> main|A|2024-01-03|Merge pull request #1 from feature/login",
  "f1|m0|feature/login|A|2024-01-02|Add login",
  "M\tsrc/login.ts",
  "m0|||A|2024-01-01|Base",
].join("\n");
const commits = parseLog(LOG).commits;

describe("GitSwimlanes orchestrator (spec §6)", () => {
  it("renders one row per commit from the commits prop", () => {
    const { container } = render(<GitSwimlanes commits={commits} />);
    expect(container.querySelectorAll(".crow")).toHaveLength(3);
  });

  it("parses the log prop when commits are not given", () => {
    const { container } = render(<GitSwimlanes log={LOG} />);
    expect(container.querySelectorAll(".crow")).toHaveLength(3);
  });

  it("renders the graph with a node per commit", () => {
    const { container } = render(<GitSwimlanes commits={commits} />);
    expect(container.querySelectorAll("[data-node]")).toHaveLength(3);
  });

  it("renders a persistent lane-label header for each lane", () => {
    const { container } = render(<GitSwimlanes commits={commits} />);
    const labels = container.querySelectorAll(".lane-label");
    expect(labels.length).toBeGreaterThan(0);
    expect(container.querySelector('.lane-label[data-lane-label="main"]')).not.toBeNull();
  });

  it("expands a commit's file panel on row click and reports the toggle", () => {
    const onCommitToggle = vi.fn();
    render(<GitSwimlanes commits={commits} onCommitToggle={onCommitToggle} />);
    expect(screen.queryByText("src/login.ts")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Add login"));
    expect(screen.getByText("src/login.ts")).toBeInTheDocument();
    expect(onCommitToggle).toHaveBeenCalledWith("f1", true);
  });

  it("requests a diff on file click and shows the result in the modal", async () => {
    const onRequestDiff = vi.fn().mockResolvedValue({ unified: "@@ -1 +1 @@\n+added" });
    render(<GitSwimlanes commits={commits} onRequestDiff={onRequestDiff} />);
    fireEvent.click(screen.getByText("Add login")); // expand f1
    fireEvent.click(screen.getByText("src/login.ts")); // pick the file
    expect(onRequestDiff).toHaveBeenCalledWith(expect.objectContaining({ hash: "f1", path: "src/login.ts" }));
    expect(await screen.findByText("+added")).toBeInTheDocument();
  });

  it("caches diff results per hash:path (reopening the same file does not re-request)", async () => {
    const onRequestDiff = vi.fn().mockResolvedValue({ unified: "@@ -1 +1 @@\n+added" });
    render(<GitSwimlanes commits={commits} onRequestDiff={onRequestDiff} />);
    fireEvent.click(screen.getByText("Add login")); // expand f1

    // First open: fetches and shows the result.
    fireEvent.click(screen.getByText("src/login.ts"));
    expect(await screen.findByText("+added")).toBeInTheDocument();
    expect(onRequestDiff).toHaveBeenCalledTimes(1);

    // Close, then reopen the same file: served from cache, no new request.
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.click(screen.getByText("src/login.ts"));
    expect(await screen.findByText("+added")).toBeInTheDocument();
    expect(onRequestDiff).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed diff (a later open retries)", async () => {
    const onRequestDiff = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce({ unified: "@@ -1 +1 @@\n+ok" });
    render(<GitSwimlanes commits={commits} onRequestDiff={onRequestDiff} />);
    fireEvent.click(screen.getByText("Add login"));

    fireEvent.click(screen.getByText("src/login.ts"));
    expect(await screen.findByText(/boom/)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(screen.getByText("src/login.ts"));
    expect(await screen.findByText("+ok")).toBeInTheDocument();
    expect(onRequestDiff).toHaveBeenCalledTimes(2);
  });

  it("seeds expansion from initialExpanded (restored UI state)", () => {
    render(<GitSwimlanes commits={commits} initialExpanded={["f1"]} />);
    // f1's file panel is open on first render, without any click.
    expect(screen.getByText("src/login.ts")).toBeInTheDocument();
  });

  it("reports expansion changes via onExpandedChange", () => {
    const onExpandedChange = vi.fn();
    render(<GitSwimlanes commits={commits} onExpandedChange={onExpandedChange} />);
    fireEvent.click(screen.getByText("Add login")); // expand f1
    expect(onExpandedChange).toHaveBeenLastCalledWith(["f1"]);
    fireEvent.click(screen.getByText("Add login")); // collapse f1
    expect(onExpandedChange).toHaveBeenLastCalledWith([]);
  });

  it("suppresses PR badges when detectPullRequests is false", () => {
    const on = render(<GitSwimlanes commits={commits} />);
    expect(on.container.querySelectorAll(".pill.pr")).toHaveLength(1); // m1 has a PR subject
    cleanup();
    const off = render(<GitSwimlanes commits={commits} options={{ detectPullRequests: false }} />);
    expect(off.container.querySelectorAll(".pill.pr")).toHaveLength(0);
  });
});
