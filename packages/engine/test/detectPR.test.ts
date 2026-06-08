import { describe, it, expect } from "vitest";
import { detectPR } from "../src/model/detectPR.js";

describe("detectPR (spec §4.4)", () => {
  it("detects Azure DevOps 'Merged PR 1042:'", () => {
    expect(detectPR("Merged PR 1042: Add login flow")).toEqual({ id: "1042", src: "Azure DevOps" });
  });

  it("detects GitHub 'Merge pull request #42'", () => {
    expect(detectPR("Merge pull request #42 from acme/feature")).toEqual({ id: "42", src: "GitHub" });
  });

  it("detects Bitbucket 'pull request #7' (not prefixed by 'Merge pull request')", () => {
    expect(detectPR("Merged in feature/x (pull request #7)")).toEqual({ id: "7", src: "Bitbucket" });
  });

  it("detects GitLab 'merge request ...!99'", () => {
    expect(detectPR("Resolve conflicts\n\nSee merge request group/proj!99")).toEqual({ id: "99", src: "GitLab" });
  });

  it("detects squash '(#42)' at the end of the subject", () => {
    expect(detectPR("Add login (#42)")).toEqual({ id: "42", src: "squash" });
  });

  it("prefers GitHub over Bitbucket when both patterns could match", () => {
    // "Merge pull request #5" contains "pull request #5" (Bitbucket pattern) too;
    // GitHub must win because it is the more specific/earlier rule.
    expect(detectPR("Merge pull request #5 from x/y")).toEqual({ id: "5", src: "GitHub" });
  });

  it("returns null for an ordinary subject", () => {
    expect(detectPR("Fix typo in README")).toBeNull();
  });
});
