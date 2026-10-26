import { createMemo } from "solid-js";
import { LayerFigure, type FigureLayer } from "./LayerFigure";
import { MorphFigure, makeMorphShapes } from "./MorphFigure";
import { InkFigure } from "./InkFigure";
import {
  curveInkScenes,
  curveLayers,
  curveMorphShapes,
  RECIPE_CURVE,
  RECIPE_VIEW_BOX,
  sampleCurve,
  type CurveControls,
  type CurvePoint,
} from "./recipe-model";

/** Existing string paths still work; four control points keep all construction sheets linked. */
export function LayersExample(
  props: { points?: CurveControls; curve?: string; polygon?: string; samples?: string } = {},
) {
  const layers = createMemo<FigureLayer[]>(() => {
    const base = curveLayers(props.points ?? RECIPE_CURVE);
    return base.map((layer, i) => ({
      ...layer,
      paths: [
        {
          ...layer.paths[0],
          d: [props.polygon, props.curve, props.samples][i] ?? layer.paths[0].d,
        },
      ],
    }));
  });
  return (
    <LayerFigure
      layers={layers()}
      initial="curve"
      viewBox={RECIPE_VIEW_BOX}
      label="Separate the drawing into layers"
    />
  );
}

/** The original 32 persistent contours remain a portable stock recipe. */
export function MorphExample() {
  const shapes = makeMorphShapes();
  return <MorphFigure shapes={shapes} label="The same contours, four forms" />;
}

/** Every ribbon cell keeps the same parameter interval, even after editing the controls. */
export function CurveMorphExample(props: { points?: CurveControls } = {}) {
  const shapes = createMemo(() => curveMorphShapes(props.points ?? RECIPE_CURVE));
  return (
    <MorphFigure
      shapes={shapes()}
      viewBox={RECIPE_VIEW_BOX}
      label="The same 24 strips, three constructions"
      edgeLight={false}
    />
  );
}

/** Input remains an ordinary polyline; seed, group and order keep 240 marks related. */
export function InkExample(props: { points?: readonly CurvePoint[] } = {}) {
  const scenes = createMemo(() => curveInkScenes(props.points ?? sampleCurve(RECIPE_CURVE)));
  return (
    <InkFigure scenes={scenes()} label="Give the same curve a material" viewBox={RECIPE_VIEW_BOX} />
  );
}
