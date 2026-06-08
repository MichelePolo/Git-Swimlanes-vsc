import { describe, it, expect } from "vitest";
import { classifyDiffLine } from "../src/diff.js";

describe("classifyDiffLine (spec §5.3)", () => {
  it("classifies hunk headers", () => {
    expect(classifyDiffLine("@@ -1,4 +1,6 @@")).toBe("hunk");
  });

  it("classifies added and removed content lines", () => {
    expect(classifyDiffLine("+const x = 1;")).toBe("add");
    expect(classifyDiffLine("-const x = 0;")).toBe("del");
  });

  it("classifies a plain context line", () => {
    expect(classifyDiffLine("  unchanged")).toBe("ctx");
    expect(classifyDiffLine("")).toBe("ctx");
  });

  it("treats +++/--- file headers as meta, not add/del", () => {
    // The trap: these start with + / - but are headers, not content.
    expect(classifyDiffLine("+++ b/src/app.ts")).toBe("meta");
    expect(classifyDiffLine("--- a/src/app.ts")).toBe("meta");
  });

  it("classifies the other git metadata lines as meta", () => {
    expect(classifyDiffLine("diff --git a/x b/x")).toBe("meta");
    expect(classifyDiffLine("index 83db48f..f7359fd 100644")).toBe("meta");
    expect(classifyDiffLine("new file mode 100644")).toBe("meta");
    expect(classifyDiffLine("deleted file mode 100644")).toBe("meta");
    expect(classifyDiffLine("similarity index 95%")).toBe("meta");
    expect(classifyDiffLine("rename from old.ts")).toBe("meta");
  });
});
