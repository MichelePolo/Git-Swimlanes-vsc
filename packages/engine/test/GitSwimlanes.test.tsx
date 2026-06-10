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

  it("shows a repo selector for multiple repos and reports selection", () => {
    const onSelectRepo = vi.fn();
    render(
      <GitSwimlanes
        commits={commits}
        repos={[{ id: "/a", label: "repo-a" }, { id: "/b", label: "repo-b" }]}
        currentRepo="/a"
        onSelectRepo={onSelectRepo}
      />,
    );
    const select = screen.getByRole("combobox");
    expect(screen.getByText("repo-a")).toBeInTheDocument();
    fireEvent.change(select, { target: { value: "/b" } });
    expect(onSelectRepo).toHaveBeenCalledWith("/b");
  });

  it("omits the repo selector for a single repo", () => {
    render(<GitSwimlanes commits={commits} repos={[{ id: "/a", label: "repo-a" }]} currentRepo="/a" />);
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows a fetch-PRs button that calls onFetchPullRefs", () => {
    const onFetchPullRefs = vi.fn();
    render(<GitSwimlanes commits={commits} onFetchPullRefs={onFetchPullRefs} />);
    fireEvent.click(screen.getByRole("button", { name: /scarica i ref delle pull request/i }));
    expect(onFetchPullRefs).toHaveBeenCalledTimes(1);
  });

  it("suppresses PR badges when detectPullRequests is false", () => {
    const on = render(<GitSwimlanes commits={commits} />);
    expect(on.container.querySelectorAll(".pill.pr")).toHaveLength(1); // m1 has a PR subject
    cleanup();
    const off = render(<GitSwimlanes commits={commits} options={{ detectPullRequests: false }} />);
    expect(off.container.querySelectorAll(".pill.pr")).toHaveLength(0);
  });

  it("applies viewConfig: hiding a branch removes its lane label", () => {
    const { container } = render(
      <GitSwimlanes commits={commits} viewConfig={{ pinned: [], hidden: ["feature/login"] }} />,
    );
    expect(container.querySelector('.lane-label[data-lane-label="feature/login"]')).toBeNull();
    expect(container.querySelector('.lane-label[data-lane-label="hidden"]')).not.toBeNull();
  });

  it("toggles the Branches panel from the toolbar and reports config changes", () => {
    const onViewConfigChange = vi.fn();
    render(<GitSwimlanes commits={commits} onViewConfigChange={onViewConfigChange} />);
    fireEvent.click(screen.getByRole("button", { name: /branches/i })); // open panel
    fireEvent.click(screen.getByRole("button", { name: "nascondi feature/login" }));
    expect(onViewConfigChange).toHaveBeenCalledWith({ pinned: [], hidden: ["feature/login"] });
  });

  it("shows the working-tree row when status is non-empty and hides it when empty", () => {
    const { rerender, container } = render(<GitSwimlanes commits={commits} status="M  src/x.ts" />);
    expect(screen.getByText(/Modifiche non committate \(1\)/)).toBeInTheDocument();
    rerender(<GitSwimlanes commits={commits} status="" />);
    expect(container.querySelector(".wt-band")).toBeNull();
  });

  it("calls onPull / onFetch from the toolbar buttons", () => {
    const onPull = vi.fn();
    const onFetch = vi.fn();
    render(<GitSwimlanes commits={commits} onPull={onPull} onFetch={onFetch} />);
    fireEvent.click(screen.getByRole("button", { name: /^pull$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^fetch$/i }));
    expect(onPull).toHaveBeenCalledTimes(1);
    expect(onFetch).toHaveBeenCalledTimes(1);
  });

  const LOG_T = [
    "m1|m0|HEAD -> main, tag: v1.0|Ann|2024-01-03|main tip",
    "f1|m0|feature|Ann|2024-01-02|feature tip",
    "m0|||Ann|2024-01-01|base",
  ].join("\n");
  const commitsT = parseLog(LOG_T).commits;

  it("opens a commit context menu (create/checkout + delete-tag) on right-click", () => {
    const onCreateBranch = vi.fn();
    const { container } = render(
      <GitSwimlanes
        commits={commitsT}
        onCreateBranch={onCreateBranch}
        onCreateTag={vi.fn()}
        onCheckout={vi.fn()}
        onDeleteTag={vi.fn()}
      />,
    );
    fireEvent.contextMenu(container.querySelector(".sw-rowpos")!); // first row = m1 (tagged HEAD)
    expect(screen.getByText("Crea branch qui")).toBeInTheDocument();
    expect(screen.getByText("Crea tag qui")).toBeInTheDocument();
    expect(screen.getByText("Checkout questo commit")).toBeInTheDocument();
    expect(screen.getByText('Elimina tag "v1.0"')).toBeInTheDocument();
    fireEvent.click(screen.getByText("Crea branch qui"));
    expect(onCreateBranch).toHaveBeenCalledWith("m1");
  });

  it("opens a lane-label menu (switch + delete) for a real branch", () => {
    const onDeleteBranch = vi.fn();
    const { container } = render(
      <GitSwimlanes commits={commitsT} onCheckout={vi.fn()} onDeleteBranch={onDeleteBranch} />,
    );
    fireEvent.contextMenu(container.querySelector('.lane-label[data-lane-label="main"]')!);
    expect(screen.getByText('Switch a "main"')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Elimina branch "main"'));
    expect(onDeleteBranch).toHaveBeenCalledWith("main");
  });

  it("does not open a menu on the hidden pseudo-lane", () => {
    const { container } = render(
      <GitSwimlanes
        commits={parseLog(LOG_T).commits}
        viewConfig={{ pinned: [], hidden: ["feature"] }}
        onCheckout={vi.fn()}
        onDeleteBranch={vi.fn()}
      />,
    );
    const hidden = container.querySelector('.lane-label[data-lane-label="hidden"]');
    expect(hidden).not.toBeNull(); // feature's commit falls into the grey 'hidden' lane (Phase 1)
    fireEvent.contextMenu(hidden!);
    expect(screen.queryByText(/^Switch a/)).toBeNull();
  });

  it("fires onCreateBranch(headHash) and onPush from the toolbar", () => {
    const onCreateBranch = vi.fn();
    const onPush = vi.fn();
    render(<GitSwimlanes commits={commitsT} onCreateBranch={onCreateBranch} onPush={onPush} />);
    fireEvent.click(screen.getByRole("button", { name: /nuovo branch/i }));
    expect(onCreateBranch).toHaveBeenCalledWith("m1"); // m1 is HEAD
    fireEvent.click(screen.getByRole("button", { name: /^push$/i }));
    expect(onPush).toHaveBeenCalledTimes(1);
  });

  it("opens revert/cherry-pick/reset on the commit menu and fires callbacks", () => {
    const onRevert = vi.fn();
    const onCherryPick = vi.fn();
    const onResetTo = vi.fn();
    const { container } = render(
      <GitSwimlanes commits={commitsT} onRevert={onRevert} onCherryPick={onCherryPick} onResetTo={onResetTo} />,
    );
    fireEvent.contextMenu(container.querySelector(".sw-rowpos")!); // first row = m1
    expect(screen.getByText("Revert questo commit")).toBeInTheDocument();
    expect(screen.getByText("Cherry-pick su HEAD")).toBeInTheDocument();
    expect(screen.getByText("Reset HEAD a questo commit")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Revert questo commit"));
    expect(onRevert).toHaveBeenCalledWith("m1");
  });
});
