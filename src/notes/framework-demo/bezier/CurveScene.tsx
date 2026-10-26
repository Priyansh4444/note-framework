import { For, Show } from "solid-js";
import { DiagramViewer } from "../../../kit";
import { Handles } from "./Handles";
import { BOX, construction, curvePath, type Cubic, type Point } from "./model";

const segments = (row: readonly Point[]) =>
  row
    .slice(1)
    .map((q, i) => `M${row[i][0]} ${row[i][1]}L${q[0]} ${q[1]}`)
    .join("");

/**
 * The whole de Casteljau picture as a pure function of its inputs: control points, t,
 * how much curve is drawn, and how visible each construction level is. Every node stays
 * mounted; only attributes change, so a scene clock or a slider can drive it.
 */
export function CurveScene(props: {
  points: Cubic;
  t: number;
  /** Draw the curve from 0 to this t. */
  drawn: number;
  /** Opacity of construction levels 1, 2 and 3 (the point B(t)). */
  levels: readonly [number, number, number];
  ghost?: boolean;
  labels?: boolean;
  onMove?: (i: number, q: Point) => void;
  onGrab?: () => void;
  label: string;
}) {
  const levels = () => construction(props.points, props.t);
  const b = () => levels()[3][0];
  return (
    <DiagramViewer viewBox={[BOX.x, BOX.y, BOX.w, BOX.h]} label={props.label}>
      <g class="bz-scene">
        <Show when={props.ghost}>
          <path class="bz-ghost" d={curvePath(props.points)} />
        </Show>
        <path class="bz-polygon" d={segments(props.points)} />
        <path class="bz-curve" d={curvePath(props.points, 0, props.drawn)} />
        <g class="bz-level bz-level-1" opacity={props.levels[0]}>
          <path d={segments(levels()[1])} />
          <For each={[0, 1, 2]}>
            {(i) => <circle cx={levels()[1][i][0]} cy={levels()[1][i][1]} r="4.5" />}
          </For>
        </g>
        <g class="bz-level bz-level-2" opacity={props.levels[1]}>
          <path d={segments(levels()[2])} />
          <For each={[0, 1]}>
            {(i) => <circle cx={levels()[2][i][0]} cy={levels()[2][i][1]} r="5" />}
          </For>
        </g>
        <Handles
          labels={props.labels}
          points={props.points}
          onMove={(i, q) => props.onMove?.(i, q)}
          onGrab={props.onGrab}
        />
        <g opacity={props.levels[2]}>
          <circle class="bz-point-halo" cx={b()[0]} cy={b()[1]} r="15" />
          <circle class="bz-point" cx={b()[0]} cy={b()[1]} r="7.5" />
        </g>
      </g>
    </DiagramViewer>
  );
}
