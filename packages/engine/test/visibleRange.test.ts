import { describe, it, expect } from "vitest";
import { visibleRange } from "../src/layout.js";

// 100 rows of 46px each (no expansion): top[i] = i*46, totalH = 4600.
const top = Array.from({ length: 100 }, (_, i) => i * 46);
const totalH = 4600;

describe("visibleRange (spec §9 — windowing)", () => {
  it("returns an empty range for no rows", () => {
    expect(visibleRange([], 0, 0, 500, 6)).toEqual([0, 0]);
  });

  it("covers the rows intersecting the viewport, padded by overscan", () => {
    // viewport [0, 460) → rows 0..9 visible; overscan 6 → [0, 16)
    expect(visibleRange(top, totalH, 0, 460, 6)).toEqual([0, 16]);
  });

  it("moves the window as the scroll position changes", () => {
    // scrollTop 460 → rows 10..19 visible; overscan 6 → [4, 26)
    expect(visibleRange(top, totalH, 460, 460, 6)).toEqual([4, 26]);
  });

  it("clamps the window to the row bounds", () => {
    // near the end: scrollTop deep, window should not exceed n
    const [first, last] = visibleRange(top, totalH, 4400, 460, 6);
    expect(last).toBe(100);
    expect(first).toBeLessThan(100);
  });

  it("uses zero overscan when asked", () => {
    expect(visibleRange(top, totalH, 0, 460, 0)).toEqual([0, 10]);
  });
});
