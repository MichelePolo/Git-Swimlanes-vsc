// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { BranchPanel } from "../src/ui/BranchPanel.js";

afterEach(cleanup);

const present = ["main", "develop", "feature/login"];

describe("BranchPanel", () => {
  it("lists each branch with pin and hide toggles", () => {
    render(<BranchPanel allBranches={present} config={{ pinned: [], hidden: [] }} onChange={() => {}} />);
    expect(screen.getByText("feature/login")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /pin/i })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: /nascondi|hide/i })).toHaveLength(3);
  });

  it("pins a branch (append) on pin-toggle", () => {
    const onChange = vi.fn();
    render(<BranchPanel allBranches={present} config={{ pinned: [], hidden: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "pin feature/login" }));
    expect(onChange).toHaveBeenCalledWith({ pinned: ["feature/login"], hidden: [] });
  });

  it("un-pins a branch already pinned", () => {
    const onChange = vi.fn();
    render(<BranchPanel allBranches={present} config={{ pinned: ["main"], hidden: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "pin main" }));
    expect(onChange).toHaveBeenCalledWith({ pinned: [], hidden: [] });
  });

  it("hides a branch on hide-toggle", () => {
    const onChange = vi.fn();
    render(<BranchPanel allBranches={present} config={{ pinned: [], hidden: [] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "nascondi feature/login" }));
    expect(onChange).toHaveBeenCalledWith({ pinned: [], hidden: ["feature/login"] });
  });

  it("marks a configured branch absent from the current log", () => {
    render(<BranchPanel allBranches={present} config={{ pinned: ["gone/branch"], hidden: [] }} onChange={() => {}} />);
    expect(screen.getByText("gone/branch")).toBeInTheDocument();
    expect(screen.getByText(/assente/i)).toBeInTheDocument();
  });
});
