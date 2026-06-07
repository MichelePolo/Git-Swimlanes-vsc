import { describe, it, expect } from "vitest";
import { colorFor, hueFromName } from "../src/model/color.js";

describe("colorFor", () => {
  it("is deterministic for the same branch name", () => {
    expect(colorFor("feature/login")).toBe(colorFor("feature/login"));
  });

  it("maps the no-branch sentinel to the fixed gray", () => {
    expect(colorFor("(no branch ref)")).toBe("hsl(215 10% 50%)");
  });

  it("keeps hue within [0, 360)", () => {
    const h = hueFromName("main");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});
