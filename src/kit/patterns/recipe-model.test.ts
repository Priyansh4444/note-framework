import { expect, test } from "bun:test";
import { createMorphModel, validateMorphShapes } from "./morph-model";
import { validateInkScenes } from "./ink-model";
import { validateLayers } from "./layer-model";
import {
  curvePoint,
  sampleCurve,
  curveLayers,
  curveMorphShapes,
  curveInkScenes,
  RECIPE_CURVE,
  type CurveControls,
} from "./recipe-model";

const cases: CurveControls[] = [
  RECIPE_CURVE,
  [
    [70, 170],
    [210, 170],
    [350, 170],
    [490, 170],
  ],
  [
    [70, 200],
    [200, 40],
    [360, 300],
    [490, 140],
  ],
  [
    [280, 170],
    [280, 170],
    [280, 170],
    [280, 170],
  ],
  [
    [24, 24],
    [536, 316],
    [24, 316],
    [536, 24],
  ],
];
test("all material constructions accept edited, straight, inflected, coincident and boundary controls", () => {
  for (const points of cases) {
    expect(curvePoint(points, 0)).toEqual(points[0]);
    expect(curvePoint(points, 1)).toEqual(points[3]);
    expect(sampleCurve(points, 12)).toHaveLength(13);
    validateLayers(curveLayers(points));
    validateMorphShapes(curveMorphShapes(points));
    validateInkScenes(curveInkScenes(sampleCurve(points)));
  }
  expect(() => sampleCurve(RECIPE_CURVE, 0)).toThrow(/positive integer/);
  expect(() => curveInkScenes([])).toThrow(/at least two/);
});
test("ribbon sides are paired around the exact same parameter samples in all destinations", () => {
  const points = RECIPE_CURVE,
    shapes = curveMorphShapes(points);
  for (const shape of shapes) {
    expect(shape.contours).toHaveLength(24);
    shape.contours.forEach((cell, i) => {
      expect(cell).toHaveLength(8);
      for (let j = 0; j < 4; j++) {
        const t = (i + 0.06 + (0.88 * j) / 3) / 24;
        const middle = [(cell[j][0] + cell[7 - j][0]) / 2, (cell[j][1] + cell[7 - j][1]) / 2];
        let expected: readonly number[];
        if (shape.id === "curve") expected = curvePoint(points, t);
        else if (shape.id === "chord")
          expected = points[0].map((v, k) => v + (points[3][k] - v) * t);
        else {
          const edge = Math.min(2, Math.floor(t * 3)),
            u = t * 3 - edge;
          expected = points[edge].map((v, k) => v + (points[edge + 1][k] - v) * u);
        }
        expect(middle[0]).toBeCloseTo(expected[0], 10);
        expect(middle[1]).toBeCloseTo(expected[1], 10);
      }
    });
  }
});
test("editing controls updates every construction without changing correspondence", () => {
  const initial = curveMorphShapes(RECIPE_CURVE),
    model = createMorphModel(initial, "curve");
  const next = curveMorphShapes(cases[2]);
  model.setShapes(next);
  model.setTarget("curve");
  model.snap();
  expect(model.snapshot().identitiesStable).toBe(true);
  expect(model.contours[0][0].x).toBe(next[0].contours[0][0][0]);
  expect(curveLayers(RECIPE_CURVE)[1].paths[0].d).not.toBe(curveLayers(cases[2])[1].paths[0].d);
  expect(curveInkScenes(sampleCurve(RECIPE_CURVE))[0].marks).not.toEqual(
    curveInkScenes(sampleCurve(cases[2]))[0].marks,
  );
});
test("seeded materials repeat exactly, keep 240 ordered marks, and make distinct constructions", () => {
  const source = sampleCurve(RECIPE_CURVE),
    scenes = curveInkScenes(source);
  expect(scenes).toEqual(curveInkScenes(source));
  expect(scenes.map((scene) => scene.marks.length)).toEqual([240, 240, 240]);
  expect(scenes[0].marks[0].x).toBe(RECIPE_CURVE[0][0]);
  expect(scenes[0].marks.at(-1)!.x2).toBeCloseTo(RECIPE_CURVE[3][0], 9);
  for (const scene of scenes)
    for (const mark of scene.marks) {
      expect(mark.x).toBeGreaterThanOrEqual(0);
      expect(mark.x2).toBeLessThanOrEqual(560);
      expect(mark.y).toBeGreaterThanOrEqual(0);
      expect(mark.y2).toBeLessThanOrEqual(340);
    }
  expect(scenes[0].marks).not.toEqual(scenes[1].marks);
  expect(scenes[1].marks).not.toEqual(scenes[2].marks);
});
