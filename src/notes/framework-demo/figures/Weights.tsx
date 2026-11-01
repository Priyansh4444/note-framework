import { createSignal, For } from "solid-js";
import { Axes, DiagramViewer, Experiment, Handle, useDiagram } from "../../../kit";
import { Handles, NAME, ROLE } from "../bezier/Handles";
import { bernstein, BOX, convexHull, curvePath, pathOf, pointAt, weights } from "../bezier/model";
import { movePoint, points } from "../bezier/store";

// Basis chart geometry, in its own SVG units.
const CW = 560,
  CH = 240,
  X0 = 44,
  X1 = 540,
  Y0 = 148,
  Y1 = 16;
const cx = (t: number) => X0 + t * (X1 - X0);
const cy = (w: number) => Y0 - w * (Y0 - Y1);
const basis = (i: number) =>
  Array.from({ length: 81 }, (_, k) => {
    const t = k / 80;
    return `${k ? "L" : "M"}${cx(t).toFixed(2)} ${cy(bernstein(3, i, t)).toFixed(2)}`;
  }).join("");
const BASIS = [0, 1, 2, 3].map(basis);
/** The t control: a faint grip a fixed 22px below the baseline, clear of every weight dot. */
function Grip(props: { t: number; onSeek: (t: number) => void }) {
  const { u } = useDiagram();
  const y = () => Y0 + 22 * u();
  return (
    <>
      <line class="nk-cursor" x1={cx(props.t)} x2={cx(props.t)} y1={Y1} y2={y()} />
      <Handle
        class="nk-faint"
        mark="bar"
        x={cx(props.t)}
        y={y()}
        label="Chart cursor t"
        value={`t = ${props.t.toFixed(2)}`}
        now={props.t}
        min={0}
        max={1}
        onDrag={(q) => props.onSeek((q[0] - X0) / (X1 - X0))}
        onStep={(dx, dy, big) => props.onSeek(props.t + (dx || -dy) * (big ? 0.1 : 0.01))}
        onLimit={props.onSeek}
      />
    </>
  );
}

/** Equal data stays at its true position; coloured ticks identify the coincident series. */
function Ties(props: { t: number; w: readonly number[] }) {
  const { u } = useDiagram();
  const groups = () =>
    props.w.flatMap((weight, i) => {
      if (props.w.slice(0, i).some((v) => v === weight)) return [];
      const indices = props.w.flatMap((v, j) => (v === weight ? [j] : []));
      return indices.length > 1 ? [{ weight, indices }] : [];
    });
  const side = () => (props.t > 0.85 ? -1 : 1);
  return (
    <For each={groups()}>
      {(group) => (
        <g
          data-weight-tie=""
          role="img"
          aria-label={`${group.indices.map((i) => NAME[i]).join(" and ")} have equal weight ${group.weight.toFixed(3)}`}
        >
          <For each={group.indices}>
            {(i, j) => (
              <line
                class={`nk-stroke ${ROLE[i]}`}
                x1={cx(props.t) + side() * 11 * u()}
                x2={cx(props.t) + side() * 17 * u()}
                y1={cy(group.weight) + (j() - (group.indices.length - 1) / 2) * 4 * u()}
                y2={cy(group.weight) + (j() - (group.indices.length - 1) / 2) * 4 * u()}
                stroke-width="2"
              />
            )}
          </For>
        </g>
      )}
    </For>
  );
}
// Each curve is named where it is tallest, so the chart needs no legend.
const PEAK = [0.06, 1 / 3, 2 / 3, 0.94];

export function Weights() {
  // No clock here: the reader sets t directly on the chart, and every view follows it.
  const [t, setT] = createSignal(0.45);
  const seek = (v: number) => {
    const bounded = Math.max(0, Math.min(1, v));
    // Inverse SVG transforms introduce sub-pixel noise at the exact symmetric midpoint.
    // Canonicalize only that numerical neighbourhood; all other drags remain continuous.
    setT(Math.abs(bounded - 0.5) <= 1e-7 ? 0.5 : bounded);
  };
  const w = () => weights(t());
  const b = () => pointAt(points(), t());
  return (
    <Experiment
      id="weight-experiment"
      question="Each control point pulls on B(t). How hard?"
      caption={
        <>
          Drag the grey grip under the chart to change <var>t</var>. The chart gives each point’s
          weight; small coloured ticks mark equal weights. All four weights are nonnegative and add
          to one, keeping B(t) in the shaded hull.
        </>
      }
    >
      <div style={{ "max-width": "560px", margin: "0 auto", width: "100%" }}>
        <DiagramViewer
          viewBox={[BOX.x, BOX.y, BOX.w, BOX.h]}
          label={`The curve inside the convex hull of its control points. At t = ${t().toFixed(2)} the weights are ${w()
            .map((v) => v.toFixed(3))
            .join(", ")}.`}
        >
          <path class="nk-area" d={pathOf(convexHull(points()))} />
          <path class="nk-stroke" d={curvePath(points())} />
          {/* B(t) under the handles: a control point is never painted over. */}
          <circle class="nk-halo" cx={b()[0]} cy={b()[1]} />
          <circle class="nk-point" cx={b()[0]} cy={b()[1]} />
          <Handles points={points()} onMove={movePoint} />
        </DiagramViewer>
        <DiagramViewer
          viewBox={[0, 0, CW, CH]}
          label="The four Bernstein weight curves for t from 0 to 1, with a cursor at the chosen t."
        >
          <Axes
            grid
            x0={X0}
            x1={X1}
            y0={Y0}
            y1={Y1}
            x={[
              { at: cx(0), label: "0" },
              { at: cx(1), label: "1" },
            ]}
            xLabelGap="3.1em"
            xTitle="t"
            y={[
              { at: cy(0), label: "0" },
              { at: cy(1), label: "1" },
            ]}
          />
          <For each={[0, 1, 2, 3]}>
            {(i) => (
              <>
                <path class={`nk-stroke ${ROLE[i]}`} d={BASIS[i]} />
                <text
                  class={`nk-label ${ROLE[i]}`}
                  x={cx(PEAK[i])}
                  y={cy(bernstein(3, i, PEAK[i]))}
                  dy="-0.6em"
                  text-anchor="middle"
                >
                  {NAME[i]}
                </text>
              </>
            )}
          </For>
          <Grip t={t()} onSeek={seek} />
          <For each={[0, 1, 2, 3]}>
            {(i) => (
              <circle
                data-weight-point={i}
                class={`nk-point ${ROLE[i]}`}
                cx={cx(t())}
                cy={cy(w()[i])}
              />
            )}
          </For>
          <Ties t={t()} w={w()} />
        </DiagramViewer>
      </div>
    </Experiment>
  );
}
