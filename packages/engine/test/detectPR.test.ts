import { describe, it } from "vitest";

describe("detectPR (spec §4.4)", () => {
  it.todo("detects Azure DevOps 'Merged PR 1042:'");
  it.todo("detects GitHub 'Merge pull request #42'");
  it.todo("detects squash '(#42)' at end of subject");
  it.todo("returns null for an ordinary subject");
});
