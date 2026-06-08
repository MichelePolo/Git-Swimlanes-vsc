import { describe, it, expect } from "vitest";
import { parseLog } from "../src/model/parseLog.js";

// A fixture in the exact format the host produces (engine spec §2.1):
//   header:  %H|%P|%D|%an|%ad|%s
//   files:   STATUS\tpath   (rename/copy: R100\told\tnew)
const LOG = [
  "aaa1111|bbb2222 ccc3333|HEAD -> main, origin/main, tag: v1.0|Alice|2024-01-18|Merge feature: add login",
  "M\tsrc/app.ts",
  "A\tREADME.md",
  "bbb2222||develop|Bob|2024-01-17|Refactor: split parser | tokenizer",
  "R100\tsrc/old.ts\tsrc/new.ts",
].join("\n");

describe("parseLog (spec §4.1)", () => {
  it("parses a header line into a CommitNode", () => {
    const { commits, byHash } = parseLog(LOG);
    expect(commits).toHaveLength(2);
    const c = byHash["aaa1111"];
    expect(c.hash).toBe("aaa1111");
    expect(c.parents).toEqual(["bbb2222", "ccc3333"]); // parents[0] = first-parent
    expect(c.author).toBe("Alice");
    expect(c.date).toBe("2024-01-18");
  });

  it("keeps pipe characters in the subject (subject is the remainder after the 5th field)", () => {
    const { byHash } = parseLog(LOG);
    expect(byHash["bbb2222"].subject).toBe("Refactor: split parser | tokenizer");
  });

  it("attaches file-status lines to the current commit", () => {
    const { byHash } = parseLog(LOG);
    expect(byHash["aaa1111"].files).toEqual([
      { code: "M", path: "src/app.ts" },
      { code: "A", path: "README.md" },
    ]);
  });

  it("handles rename lines R100 old\\tnew", () => {
    const { byHash } = parseLog(LOG);
    expect(byHash["bbb2222"].files).toEqual([
      { code: "R100", old: "src/old.ts", path: "src/new.ts" },
    ]);
  });

  it("parses refs: HEAD ->, branches, and tag: entries", () => {
    const { byHash } = parseLog(LOG);
    const c = byHash["aaa1111"];
    expect(c.head).toBe(true);
    expect(c.branches).toEqual(["main", "origin/main"]);
    expect(c.tags).toEqual(["v1.0"]);
  });

  it("treats a commit with no parents (root) as an empty parents array", () => {
    const { byHash } = parseLog(LOG);
    expect(byHash["bbb2222"].parents).toEqual([]);
  });

  it("ignores blank lines and returns an empty result for empty input", () => {
    expect(parseLog("\n\n  \n").commits).toEqual([]);
    expect(parseLog("").commits).toEqual([]);
  });
});
