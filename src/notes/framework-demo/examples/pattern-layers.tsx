import { createMemo, createSignal, Index } from "solid-js";
import { LayerFigure } from "../../../kit";
import {
  curveLayers,
  CURVE_LAYER_REASONS,
  RECIPE_VIEW_BOX,
  type CurveControls,
  type CurveLayerId,
} from "../../../kit/patterns/recipe-model";

export function PatternLayers(props: { points: CurveControls }) {
  const [selected, setSelected] = createSignal<CurveLayerId>("curve");
  const layers = createMemo(() => curveLayers(props.points));
  const contribution = () => layers().find((layer) => layer.id === selected())!;
  return (
    <>
      <LayerFigure
        layers={layers()}
        viewBox={RECIPE_VIEW_BOX}
        value={selected()}
        onChange={(id) => setSelected(id as CurveLayerId)}
        label="Lift a sheet to inspect its contribution"
      />
      <div class="bz-pattern-contribution" aria-label="Selected contribution">
        <svg
          viewBox={RECIPE_VIEW_BOX.join(" ")}
          role="img"
          aria-label={`${contribution().label}, shown face on`}
        >
          <Index each={contribution().paths}>{(path) => <path d={path().d} />}</Index>
        </svg>
        <p aria-live="polite">
          <strong>{contribution().label}.</strong> {CURVE_LAYER_REASONS[selected()]}
        </p>
      </div>
    </>
  );
}
