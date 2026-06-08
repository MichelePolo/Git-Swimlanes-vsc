import { describe, it, expect } from "vitest";
import { pullRefspecFor } from "../src/forge.js";

describe("pullRefspecFor (spec §7.2 — PR ref fetch)", () => {
  it("maps GitHub remotes to refs/pull/*/head", () => {
    const rs = "+refs/pull/*/head:refs/remotes/origin/pr/*";
    expect(pullRefspecFor("https://github.com/acme/proj.git")).toBe(rs);
    expect(pullRefspecFor("git@github.com:acme/proj.git")).toBe(rs);
  });

  it("maps Azure DevOps remotes to refs/pull/*/merge", () => {
    expect(pullRefspecFor("https://dev.azure.com/org/proj/_git/repo")).toBe(
      "+refs/pull/*/merge:refs/remotes/origin/pr/*",
    );
    expect(pullRefspecFor("https://org.visualstudio.com/proj/_git/repo")).toBe(
      "+refs/pull/*/merge:refs/remotes/origin/pr/*",
    );
  });

  it("maps GitLab remotes to refs/merge-requests/*/head", () => {
    expect(pullRefspecFor("git@gitlab.com:group/proj.git")).toBe(
      "+refs/merge-requests/*/head:refs/remotes/origin/mr/*",
    );
  });

  it("maps Bitbucket remotes to refs/pull-requests/*/from", () => {
    expect(pullRefspecFor("git@bitbucket.org:team/proj.git")).toBe(
      "+refs/pull-requests/*/from:refs/remotes/origin/pr/*",
    );
  });

  it("returns null for an unrecognized host", () => {
    expect(pullRefspecFor("https://example.com/x/y.git")).toBeNull();
    expect(pullRefspecFor("")).toBeNull();
  });
});
