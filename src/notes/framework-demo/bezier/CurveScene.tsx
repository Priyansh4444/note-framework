import { For, Show } from "solid-js";
import { DiagramViewer, Legend } from "../../../kit";
import { Handles } from "./Handles";
import { BOX, construction, curvePath, type Cubic, type Point } from "./model";

const segments = (row: readonly Point[]) =>
  row
    .slice(1)
    .map((q, i) => `M${row[i][0]} ${row[i][1]}L${q[0]} ${q[1]}`)
    .join("");

/**
 * The de Casteljau picture as a pure function of points, t, drawn length and level opacity.
 * Nodes stay mounted; only attributes change. Rows brighten as they converge on B(t).
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
  /** Explain the row tones with a stable, explicit point-count key. */
  counts?: boolean;
  onMove?: (i: number, q: Point) => void;
  onGrab?: () => void;
  label: string;
}) {
  const levels = () => construction(props.points, props.t);
  const b = () => levels()[3][0];
  const row = (i: 1 | 2) => levels()[i];
  return (
    <>
      <DiagramViewer viewBox={[BOX.x, BOX.y, BOX.w, BOX.h]} label={props.label}>
        <g data-scene>
          <Show when={props.ghost}>
            <path class="nk-ghost" d={curvePath(props.points)} />
          </Show>
          <path class="nk-guide" d={segments(props.points)} />
          <path class="nk-curve" d={curvePath(props.points, 0, props.drawn)} />
          <For each={[1, 2] as const}>
            {(i) => (
              <g
                data-level={i}
                opacity={props.levels[i - 1]}
                style={{ "--role": i === 1 ? "var(--muted)" : "var(--text)" }}
              >
                <path class="nk-stroke" d={segments(row(i))} />
                <For each={row(i).map((_, k) => k)}>
                  {(k) => <circle class="nk-dot" cx={row(i)[k][0]} cy={row(i)[k][1]} />}
                </For>
              </g>
            )}
          </For>
          {/* B(t) under the handles: a control point is never painted over. */}
          <g data-level="3" opacity={props.levels[2]}>
            <circle class="nk-halo" cx={b()[0]} cy={b()[1]} />
            <circle class="nk-point" cx={b()[0]} cy={b()[1]} />
          </g>
          <Handles
            labels={props.labels}
            points={props.points}
            onMove={(i, q) => props.onMove?.(i, q)}
            onGrab={props.onGrab}
          />
        </g>
      </DiagramViewer>
      <Show when={props.counts !== undefined}>
        <div
          style={{ visibility: props.counts ? "visible" : "hidden" }}
          aria-hidden={!props.counts}
        >
          <Legend
            items={[
              { class: "nk-muted", mark: "dot", label: "3 grey points: first mixes" },
              { class: "nk-text", mark: "dot", label: "2 lighter points: mix again" },
              { class: "nk-bright", mark: "dot", label: "1 white point: the result" },
            ]}
          />
        </div>
      </Show>
    </>
  );
}
