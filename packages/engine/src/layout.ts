import type { CommitNode, LaneModel } from "@michelepolo/git-swimlanes-contract";

export const LAYOUT = {
  LP: 16,      // graph left padding
  laneW: 28,   // column width
  RP: 10,      // right padding
  rowH: 46,    // commit row height
  dotR: 6,     // normal node radius
  mergeR: 7.5, // merge node radius
} as const;

export const laneX = (i: number): number =>
  LAYOUT.LP + i * LAYOUT.laneW + LAYOUT.laneW / 2;

// ─── Vertical layout (engine spec §4.5) ──────────────────────────────────────

const PANEL = { lineH: 24, padV: 18, cap: 250 } as const;

/** Height of a commit's expanded file panel: one line per file (min 1), capped. */
export function panelHeight(c: CommitNode): number {
  const n = Math.max(c.files.length, 1);
  return Math.min(PANEL.padV + n * PANEL.lineH, PANEL.cap);
}

/**
 * Vertical offsets shared by the SVG graph and the HTML rows, given which commits
 * are expanded. `top[i]` is the y of row i; expanding a commit adds its panel height
 * to every following offset. `dotY(i)` centers the node within its (collapsed) row.
 */
export function computeOffsets(
  m: LaneModel,
  expanded: Set<string>,
): { top: number[]; totalH: number; dotY: (i: number) => number } {
  const top: number[] = [];
  let y = 0;
  for (const c of m.commits) {
    top.push(y);
    y += LAYOUT.rowH + (expanded.has(c.hash) ? panelHeight(c) : 0);
  }
  const dotY = (i: number): number => top[i] + LAYOUT.rowH / 2;
  return { top, totalH: y, dotY };
}

/**
 * Half-open range [first, last) of row indices intersecting the viewport, padded by
 * `overscan` rows on each side. Pure: the component supplies measured scrollTop/viewportH
 * and the offset array from {@link computeOffsets}. See engine spec §9 (virtualization).
 */
export function visibleRange(
  top: number[],
  totalH: number,
  scrollTop: number,
  viewportH: number,
  overscan = 6,
): [number, number] {
  const n = top.length;
  if (n === 0) return [0, 0];
  const bottomOf = (i: number): number => (i + 1 < n ? top[i + 1] : totalH);

  let first = 0;
  while (first < n && bottomOf(first) <= scrollTop) first++;
  let last = first;
  while (last < n && top[last] < scrollTop + viewportH) last++;

  return [Math.max(0, first - overscan), Math.min(n, last + overscan)];
}
