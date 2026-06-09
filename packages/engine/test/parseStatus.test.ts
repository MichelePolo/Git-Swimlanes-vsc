import { describe, it, expect } from "vitest";
import { parseStatus } from "../src/model/parseStatus.js";

describe("parseStatus (git status --porcelain)", () => {
  it("returns [] for empty input", () => {
    expect(parseStatus("")).toEqual([]);
    expect(parseStatus("\n\n")).toEqual([]);
  });

  it("parses staged vs unstaged codes (X=index, Y=worktree)", () => {
    expect(parseStatus("M  src/a.ts")).toEqual([{ index: "M", worktree: " ", path: "src/a.ts" }]);
    expect(parseStatus(" M src/b.ts")).toEqual([{ index: " ", worktree: "M", path: "src/b.ts" }]);
    expect(parseStatus("MM src/c.ts")).toEqual([{ index: "M", worktree: "M", path: "src/c.ts" }]);
  });

  it("parses added, deleted, and untracked", () => {
    expect(parseStatus("A  new.ts")).toEqual([{ index: "A", worktree: " ", path: "new.ts" }]);
    expect(parseStatus(" D gone.ts")).toEqual([{ index: " ", worktree: "D", path: "gone.ts" }]);
    expect(parseStatus("?? junk.log")).toEqual([{ index: "?", worktree: "?", path: "junk.log" }]);
  });

  it("parses a rename with old -> new", () => {
    expect(parseStatus("R  old.ts -> new.ts")).toEqual([
      { index: "R", worktree: " ", old: "old.ts", path: "new.ts" },
    ]);
  });

  it("parses multiple lines", () => {
    expect(parseStatus("M  a\n?? b")).toHaveLength(2);
  });
});
