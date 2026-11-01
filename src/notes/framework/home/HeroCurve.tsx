import { EXAMPLE } from "./links";
import { createSignal } from "solid-js";
import { Parameter } from "../../../kit";
import { CurveScene } from "../../framework-demo/bezier/CurveScene";
import { NAME } from "../../framework-demo/bezier/Handles";
import {
  clampPoint,
  mapCubic,
  pointAt,
  START,
  type Cubic,
  type Point,
} from "../../framework-demo/bezier/model";

/** The example note's main figure, live: drag a control point or slide t. */
export function HeroCurve() {
  // The homepage is an independent experiment; visiting it must not edit the example note.
  const [points, setPoints] = createSignal<Cubic>(START);
  const movePoint = (index: number, point: Point) =>
    setPoints((current) => mapCubic(current, (old, i) => (i === index ? clampPoint(point) : old)));
  const [t, setT] = createSignal(0.42);
  const b = () => pointAt(points(), t());
  return (
    <figure class="fw-hero-figure">
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
        Coloured points shape the curve. Grey lines locate the white dot as <var>t</var> goes from 0
        to 1. <a href={EXAMPLE}>See why it works →</a>
      </figcaption>
    </figure>
  );
}
