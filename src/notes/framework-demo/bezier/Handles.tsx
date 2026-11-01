import { For } from "solid-js";
import { Handle, useDiagram } from "../../../kit";
import type { Cubic, Point } from "./model";

/** One colour class per control point, reused by every figure, weight and legend. */
export const ROLE = ["nk-orange", "nk-magenta", "nk-green", "nk-blue"] as const;
export const NAME = ["P₀", "P₁", "P₂", "P₃"] as const;

/** Four draggable control points, each labelled on the side away from the curve. */
export function Handles(props: {
  points: Cubic;
  onMove: (i: number, q: Point) => void;
  onGrab?: () => void;
  labels?: boolean;
  /** Radius, in SVG units, of a mark around point i; its label sits just beyond it. */
  clearance?: (i: number, u: number) => number;
}) {
  const diagram = useDiagram();
  return (
    <For each={[0, 1, 2, 3]}>
      {(i) => {
        const p = () => props.points[i];
        // Opposite the neighbouring control points.
        const away = () => {
          const ps = props.points,
            q = p();
          const near = i === 0 ? [ps[1]] : i === 3 ? [ps[2]] : [ps[i - 1], ps[i + 1]];
          let dx = 0,
            dy = 0;
          for (const n of near) {
            const l = Math.hypot(n[0] - q[0], n[1] - q[1]) || 1;
            dx += (q[0] - n[0]) / l;
            dy += (q[1] - n[1]) / l;
          }
          const l = Math.hypot(dx, dy);
          return l < 1e-6 ? [0, -1] : [dx / l, dy / l];
        };
        // Beyond the point, but always inside the figure: an edge pulls the label back in.
        const label = () => {
          const em = 16 * diagram.u();
          const d = Math.max(1.8 * em, (props.clearance?.(i, diagram.u()) ?? 0) + 0.8 * em);
          const [bx, by, bw, bh] = diagram.box;
          const [left, right, top, bottom] = [
            bx + 0.9 * em,
            bx + bw - 0.9 * em,
            by + 1.4 * em,
            by + bh - 0.9 * em,
          ];
          let [ax, ay] = away();
          // Mirror a side that would leave the figure, so the label flips inward, clear of its dot.
          if (p()[0] + ax * d < left || p()[0] + ax * d > right) ax = -ax;
          if (p()[1] + ay * d + 0.35 * em < top || p()[1] + ay * d + 0.35 * em > bottom) ay = -ay;
          const x = p()[0] + ax * d,
            y = p()[1] + ay * d + 0.35 * em;
          return [Math.min(right, Math.max(left, x)), Math.min(bottom, Math.max(top, y))];
        };
        return (
          <Handle
            class={ROLE[i]}
            x={p()[0]}
            y={p()[1]}
            label={`Control point ${NAME[i]}`}
            value={`(${Math.round(p()[0])}, ${Math.round(p()[1])})`}
            onGrab={props.onGrab}
            onDrag={(q) => props.onMove(i, [q[0], q[1]])}
          >
            {props.labels !== false && (
              <text class="nk-label" x={label()[0]} y={label()[1]} text-anchor="middle">
                P
                <tspan baseline-shift="sub" font-size="0.7em">
                  {i}
                </tspan>
              </text>
            )}
          </Handle>
        );
      }}
    </For>
  );
}
