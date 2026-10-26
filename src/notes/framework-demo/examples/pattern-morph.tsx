import { createMemo } from "solid-js";
import { MorphFigure } from "../../../kit";
import {
  curveMorphShapes,
  RECIPE_VIEW_BOX,
  type CurveControls,
} from "../../../kit/patterns/recipe-model";

/** The caller supplies the same four points used by the other figures. */
export function PatternMorph(props: { points: CurveControls }) {
  const shapes = createMemo(() => curveMorphShapes(props.points));
  return (
    <>
      <MorphFigure
        shapes={shapes()}
        viewBox={RECIPE_VIEW_BOX}
        label="The same 24 strips, three constructions"
        edgeLight={false}
      />
      <p class="bz-pattern-reading">
        Each strip owns the same interval of the curve parameter, t. Choose Handles to follow the
        three handle edges, or Straight to join just the endpoints. Moving strips are a visual
        blend; they do not trace an exact intermediate cubic.
      </p>
    </>
  );
}
