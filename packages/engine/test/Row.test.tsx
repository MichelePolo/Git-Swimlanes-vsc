// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { parseLog } from "../src/model/parseLog.js";
import { detectPR } from "../src/model/detectPR.js";
import { Row } from "../src/ui/Row.js";

afterEach(cleanup);

const LOG = [
  "abc1234|p1 p2|HEAD -> main, tag: v1.0|Alice|2024-01-18|Merge pull request #42 from x/y",
  "M\tsrc/app.ts",
  "A\tREADME.md",
].join("\n");
const commit = parseLog(LOG).commits[0];
const pr = detectPR(commit.subject);

function renderRow(over: Partial<Parameters<typeof Row>[0]> = {}) {
  const onToggle = vi.fn();
  const onFileSelect = vi.fn();
  render(
    <Row commit={commit} pr={pr} expanded={false} onToggle={onToggle} onFileSelect={onFileSelect} {...over} />,
  );
  return { onToggle, onFileSelect };
}

describe("Row", () => {
  it("shows the short hash, subject and author·date", () => {
    renderRow();
    expect(screen.getByText("abc1234")).toBeInTheDocument();
    expect(screen.getByText("Merge pull request #42 from x/y")).toBeInTheDocument();
    expect(screen.getByText(/Alice · 2024-01-18/)).toBeInTheDocument();
  });

  it("renders branch, tag and PR badges", () => {
    renderRow();
    expect(screen.getByText("main")).toBeInTheDocument();
    expect(screen.getByText(/v1\.0/)).toBeInTheDocument();
    expect(screen.getByText("⇲ PR #42")).toBeInTheDocument();
  });

  it("shows the file count", () => {
    renderRow();
    expect(screen.getByText("⊞ 2")).toBeInTheDocument();
  });

  it("hides the file panel when collapsed", () => {
    renderRow({ expanded: false });
    expect(screen.queryByText("src/app.ts")).not.toBeInTheDocument();
  });

  it("shows file rows (code + path) when expanded", () => {
    renderRow({ expanded: true });
    expect(screen.getByText("src/app.ts")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect(screen.getByText("M")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("toggles when the commit row is clicked", () => {
    const { onToggle } = renderRow();
    fireEvent.click(screen.getByText("Merge pull request #42 from x/y"));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });

  it("selects a file (without toggling) when a file row is clicked", () => {
    const { onToggle, onFileSelect } = renderRow({ expanded: true });
    fireEvent.click(screen.getByText("src/app.ts"));
    expect(onFileSelect).toHaveBeenCalledTimes(1);
    expect(onFileSelect.mock.calls[0][0]).toMatchObject({ path: "src/app.ts", code: "M" });
    expect(onToggle).not.toHaveBeenCalled();
  });
});
