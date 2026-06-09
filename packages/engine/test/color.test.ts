import { describe, it, expect } from "vitest";
import { colorFor, hueFromName, laneColorer } from "../src/model/color.js";

describe("colorFor", () => {
  it("is deterministic for the same branch name", () => {
    expect(colorFor("feature/login")).toBe(colorFor("feature/login"));
  });

  it("defaults to 68% saturation / 60% lightness (dark-tuned)", () => {
    expect(colorFor("main")).toBe(`hsl(${hueFromName("main")} 68% 60%)`);
  });

  it("applies custom saturation and lightness", () => {
    expect(colorFor("main", 50, 45)).toBe(`hsl(${hueFromName("main")} 50% 45%)`);
  });

  it("maps the no-branch sentinel to the fixed gray regardless of params", () => {
    expect(colorFor("(no branch ref)")).toBe("hsl(215 10% 50%)");
    expect(colorFor("(no branch ref)", 50, 45)).toBe("hsl(215 10% 50%)");
  });

  it("maps the 'hidden' lane to a fixed gray, distinct from the no-branch gray", () => {
    expect(colorFor("hidden")).toBe("hsl(215 8% 42%)");
    expect(colorFor("hidden", 50, 45)).toBe("hsl(215 8% 42%)"); // fixed regardless of theme
    expect(colorFor("hidden")).not.toBe(colorFor("(no branch ref)"));
  });

  it("keeps hue within [0, 360)", () => {
    const h = hueFromName("main");
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});

describe("laneColorer", () => {
  it("binds colors to a theme's lane saturation/lightness", () => {
    const color = laneColorer({ laneSaturation: 60, laneLightness: 45 });
    expect(color("develop")).toBe(`hsl(${hueFromName("develop")} 60% 45%)`);
  });

  it("defaults to 68/60 when no theme (or fields) are given", () => {
    expect(laneColorer()("develop")).toBe(colorFor("develop"));
    expect(laneColorer({})("develop")).toBe(colorFor("develop"));
  });
});
