import { Fragment } from "react";
import type { LaneModel } from "@michelepolo/git-swimlanes-contract";
import { laneX } from "../layout.js";
import { colorFor } from "../model/color.js";

export interface LaneHeaderProps {
  model: LaneModel;
  /** Branch → color (theme-aware); defaults to the dark-tuned colorFor. */
  color?: (name: string) => string;
}

/** Header height; tall enough for the rotated labels (engine spec §5.1). */
export const LANE_HEAD_H = 104;

/**
 * Persistent, labeled lane headers — a core principle (§1): every lane carries its
 * branch name as a stable column header, not only as a pill on the tip commit. Each
 * label sits at the same `laneX(i)` as the graph lane below it, so they stay aligned.
 */
export function LaneHeader({ model, color = colorFor }: LaneHeaderProps): JSX.Element {
  return (
    <div className="lane-head" style={{ width: model.graphW, height: LANE_HEAD_H, position: "relative" }}>
      {model.laneNames.map((name, i) => {
        const x = laneX(i);
        const c = color(name);
        const short = name.length > 18 ? `${name.slice(0, 17)}…` : name;
        return (
          <Fragment key={i}>
            <span className="lane-tick" style={{ left: x - 1, background: c }} />
            <span className="lane-label" data-lane-label={name} style={{ left: x, color: c }} title={name}>
              {short}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}
