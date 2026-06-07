import { describe, it } from "vitest";

describe("assignLanes (spec §4.3)", () => {
  it.todo("gives main lane 0 and develop lane 1");
  it.todo("keeps feature commits in their own lane across a merge (first-parent)");
  it.todo("routes commits with no claiming ref into the (no branch ref) lane");
  it.todo("dedups origin/<name> against local <name>, preferring local");
});
