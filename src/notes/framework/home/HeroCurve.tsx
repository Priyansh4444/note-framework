import { EXAMPLE } from "./links";
import { createSignal } from "solid-js";
import { Parameter } from "../../../kit";
import { CurveScene } from "../../framework-demo/bezier/CurveScene";
import { NAME } from "../../framework-demo/bezier/Handles";
import { pointAt } from "../../framework-demo/bezier/model";
import { movePoint, points } from "../../framework-demo/bezier/store";
import "../../framework-demo/demo.css";

/** The example note's main figure, live: drag a control point or slide t. */
export function HeroCurve() {
  const [t, setT] = createSignal(0.42);
  const b = () => pointAt(points(), t());
  return (
    <figure class="bz-home fw-hero-figure">
      <CurveScene
        points={points()}
        t={t()}
        drawn={1}
        levels={[1, 1, 1]}
        onMove={movePoint}
        label={`A live cubic Bézier curve with control points ${points()
          .map((q, i) => `${NAME[i]} (${q.join(", ")})`)
          .join(
            ", ",
          )}. At t = ${t().toFixed(2)} the construction meets the curve at (${b().map(Math.round).join(", ")}).`}
      />
      <Parameter
        label={
          <>
            Slide <var>t</var>, or drag a point
          </>
        }
        value={t()}
        min={0}
        max={1}
        step={0.01}
        onInput={setT}
      />
      <figcaption>
        A live figure from the <a href={EXAMPLE}>example note</a>. The grey lines are the
        construction; the white curve is every point it reaches.
      </figcaption>
    </figure>
  );
}
