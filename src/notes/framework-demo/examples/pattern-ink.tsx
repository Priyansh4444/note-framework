import { createMemo } from "solid-js";
import { InkFigure } from "../../../kit";
import {
  curveInkScenes,
  sampleCurve,
  RECIPE_VIEW_BOX,
  type CurveControls,
} from "../../../kit/patterns/recipe-model";

export function PatternInk(props: { points: CurveControls }) {
  const scenes = createMemo(() => curveInkScenes(sampleCurve(props.points)));
  return (
    <>
      <InkFigure
        scenes={scenes()}
        viewBox={RECIPE_VIEW_BOX}
        label="Give the same curve a material"
      />
      <p class="bz-pattern-reading">
        Dry brush follows the curve. Three strands weave around it; Hatching turns the marks across
        it. All three reuse 240 marks with fixed seeds. Texture and width are drawing choices, not
        numerical error or uncertainty.
      </p>
    </>
  );
}
