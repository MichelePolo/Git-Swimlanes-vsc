import type { LaneModel } from "@michelepolo/git-swimlanes-contract";
import { LAYOUT, laneX } from "../layout.js";
import { colorFor } from "../model/color.js";

export interface GraphProps {
  model: LaneModel;
  offsets: { top: number[]; totalH: number; dotY: (i: number) => number };
  /** Hashes that carry a detected PR (drawn with a halo). */
  prHashes?: Set<string>;
  showLaneGuides?: boolean;
  /** Branch → color (theme-aware); defaults to the dark-tuned colorFor. */
  color?: (name: string) => string;
  /** Visible row window [first, last); when set, only intersecting nodes/edges render. */
  range?: [number, number];
}

/**
 * The SVG history graph: lane guides, parent edges, and commit nodes. See spec §5.1.
 * Vertical positions come from `offsets` (shared with the rows so they stay aligned).
 */
export function Graph({
  model,
  offsets,
  prHashes,
  showLaneGuides = true,
  color = colorFor,
  range,
}: GraphProps): JSX.Element {
  const { dotY, totalH } = offsets;
  const pr = prHashes ?? new Set<string>();
  const [rFirst, rLast] = range ?? [0, model.commits.length];
  const inWindow = (hash: string): boolean => {
    const r = model.rowOf[hash];
    return r >= rFirst && r < rLast;
  };
  // An edge is visible if its row span intersects the window — not only if an endpoint is
  // inside it, so long connectors that cross a scrolled-past region still render.
  const edgeInWindow = (a: string, b: string): boolean => {
    const ra = model.rowOf[a];
    const rb = model.rowOf[b];
    return Math.min(ra, rb) < rLast && Math.max(ra, rb) >= rFirst;
  };

  const guides = showLaneGuides
    ? model.laneNames.map((name, i) => (
        <line
          key={`guide-${i}`}
          className="lane-guide"
          x1={laneX(i)}
          y1={0}
          x2={laneX(i)}
          y2={totalH}
          stroke={color(name)}
          strokeWidth={1}
          opacity={0.07}
        />
      ))
    : null;

  const edges: JSX.Element[] = [];
  for (const c of model.commits) {
    const cx = laneX(model.laneOf[c.hash]);
    const cy = dotY(model.rowOf[c.hash]);
    c.parents.forEach((p, idx) => {
      if (!(p in model.byHash)) return; // parent absent (e.g. shallow clone) → omit edge
      if (!edgeInWindow(c.hash, p)) return; // edge does not intersect the visible window
      const px = laneX(model.laneOf[p]);
      const py = dotY(model.rowOf[p]);
      // first-parent → child's color (continuity); other parents → parent's color (merge).
      const col = idx === 0 ? color(model.branchOf[c.hash]) : color(model.branchOf[p]);
      if (cx === px) {
        edges.push(
          <line
            key={`${c.hash}-${p}`}
            className="edge"
            data-edge={`${c.hash}-${p}`}
            x1={cx}
            y1={cy}
            x2={px}
            y2={py}
            stroke={col}
            strokeWidth={2}
          />,
        );
      } else {
        const my = (cy + py) / 2;
        edges.push(
          <path
            key={`${c.hash}-${p}`}
            className="edge"
            data-edge={`${c.hash}-${p}`}
            d={`M ${cx} ${cy} C ${cx} ${my}, ${px} ${my}, ${px} ${py}`}
            fill="none"
            stroke={col}
            strokeWidth={2}
          />,
        );
      }
    });
  }

  const nodes: JSX.Element[] = [];
  for (const c of model.commits) {
    if (!inWindow(c.hash)) continue; // node outside the visible window
    const x = laneX(model.laneOf[c.hash]);
    const y = dotY(model.rowOf[c.hash]);
    const col = color(model.branchOf[c.hash]);
    if (pr.has(c.hash)) {
      nodes.push(
        <circle
          key={`${c.hash}-halo`}
          className="pr-halo"
          data-halo={c.hash}
          cx={x}
          cy={y}
          r={11}
          fill="none"
          stroke="#7b93ff"
          strokeWidth={1.6}
          opacity={0.9}
        />,
      );
    }
    if (c.parents.length >= 2) {
      nodes.push(
        <circle key={`${c.hash}-node`} className="node merge" data-node={c.hash} cx={x} cy={y} r={LAYOUT.mergeR} fill={col} stroke="var(--bg)" strokeWidth={2} />,
        <circle key={`${c.hash}-hole`} className="node-hole" cx={x} cy={y} r={2.6} fill="var(--bg)" />,
      );
    } else {
      nodes.push(
        <circle key={`${c.hash}-node`} className="node" data-node={c.hash} cx={x} cy={y} r={LAYOUT.dotR} fill={col} stroke="var(--bg)" strokeWidth={2} />,
      );
    }
  }

  return (
    <svg className="graph" width={model.graphW} height={totalH}>
      {guides}
      {edges}
      {nodes}
    </svg>
  );
}
