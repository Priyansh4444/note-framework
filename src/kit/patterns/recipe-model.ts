import type { FigureLayer } from "./layer-model";
import { brushStroke, type InkMark, type InkScene } from "./ink-model";
import type { MorphShape } from "./morph-model";

export type CurvePoint = readonly [number, number];
export type CurveControls = readonly [CurvePoint, CurvePoint, CurvePoint, CurvePoint];
export const RECIPE_CURVE: CurveControls = [
  [70, 270],
  [150, 60],
  [400, 50],
  [490, 250],
];
export const RECIPE_VIEW_BOX = [0, 0, 560, 340] as const;

/** Bernstein evaluation keeps this model independent of any particular note. */
export function curvePoint(points: CurveControls, t: number): CurvePoint {
  const u = 1 - t,
    w = [u ** 3, 3 * u * u * t, 3 * u * t * t, t ** 3];
  return [
    w.reduce((sum, v, i) => sum + v * points[i][0], 0),
    w.reduce((sum, v, i) => sum + v * points[i][1], 0),
  ];
}
export const sampleCurve = (points: CurveControls, segments = 80): CurvePoint[] => {
  if (!Number.isInteger(segments) || segments < 1)
    throw new Error("sampleCurve needs a positive integer segment count.");
  return Array.from({ length: segments + 1 }, (_, i) => curvePoint(points, i / segments));
};
const mix = (a: CurvePoint, b: CurvePoint, t: number): CurvePoint => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
export const curvePolyline = (points: readonly CurvePoint[]) =>
  points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
const exactPath = (p: CurveControls) =>
  `M${p[0].join(" ")}C${p
    .slice(1)
    .map((q) => q.join(" "))
    .join(" ")}`;

export type CurveLayerId = "guides" | "curve" | "pieces";
export const CURVE_LAYER_REASONS: Record<CurveLayerId, string> = {
  guides:
    "The handles steer the curve. Their connecting lines are construction guides, not the curve itself.",
  curve: "This is the exact cubic path defined by the four handles.",
  pieces:
    "Twelve straight chords join equally spaced parameter values. They approximate the curve; they are not its control polygon.",
};
export function curveLayers(points: CurveControls): FigureLayer[] {
  return [
    { id: "guides", label: "Handles", paths: [{ d: curvePolyline(points), role: "quiet" }] },
    { id: "curve", label: "Curve", paths: [{ d: exactPath(points), role: "ink" }] },
    {
      id: "pieces",
      label: "Chords",
      paths: [{ d: curvePolyline(sampleCurve(points, 12)), role: "accent" }],
    },
  ];
}

/** Each strip keeps its t interval and its left/right edge partners in all three forms. */
export function curveMorphShapes(points: CurveControls): MorphShape[] {
  const polygonPoint = (t: number): CurvePoint => {
    const edge = Math.min(2, Math.floor(t * 3));
    return mix(points[edge], points[edge + 1], t * 3 - edge);
  };
  const forms = [
    { id: "curve", label: "Curve", at: (t: number) => curvePoint(points, t) },
    { id: "polygon", label: "Handles", at: polygonPoint },
    { id: "chord", label: "Straight", at: (t: number) => mix(points[0], points[3], t) },
  ];
  return forms.map((form) => ({
    id: form.id,
    label: form.label,
    contours: Array.from({ length: 24 }, (_, cell) => {
      // A small fixed gap makes the correspondence visible, including on a straight line.
      const ts = Array.from({ length: 4 }, (_, j) => (cell + 0.06 + (0.88 * j) / 3) / 24);
      const edge = (t: number, side: number): CurvePoint => {
        const p = form.at(t),
          a = form.at(Math.max(0, t - 0.0001)),
          b = form.at(Math.min(1, t + 0.0001));
        const dx = b[0] - a[0],
          dy = b[1] - a[1],
          length = Math.hypot(dx, dy);
        const nx = length ? -dy / length : 0,
          ny = length ? dx / length : 1;
        return [p[0] + side * 9 * nx, p[1] + side * 9 * ny];
      };
      return [...ts.map((t) => edge(t, 1)), ...ts.toReversed().map((t) => edge(t, -1))];
    }),
  }));
}

/** Three groups of eighty marks retain group, distance order and seed between materials. */
export function curveInkScenes(points: readonly CurvePoint[]): InkScene[] {
  if (points.length < 2 || points.some((p) => p.length !== 2 || !p.every(Number.isFinite)))
    throw new Error("curveInkScenes needs at least two finite points.");
  // A coincident curve is a legitimate editor state. Show its small mark rather than invent a direction.
  const collapsed = points.every((p) => p[0] === points[0][0] && p[1] === points[0][1]);
  const source = collapsed
    ? [points[0], [points[0][0] + 0.001, points[0][1]] as CurvePoint]
    : points;
  const strokes = [0, 1, 2].map((group) =>
    brushStroke(source, { seed: 17 + group, count: 80, width: 8 }),
  );
  const transform = (kind: "brush" | "braid" | "hatch"): InkMark[] =>
    strokes.flatMap((marks, group) =>
      marks.map((mark, i) => {
        const t = i / 80,
          u = (i + 1) / 80;
        const dx = mark.x2 - mark.x,
          dy = mark.y2 - mark.y,
          length = Math.hypot(dx, dy);
        const nx = length ? -dy / length : 0,
          ny = length ? dx / length : 1;
        if (kind === "brush") return mark;
        if (kind === "braid") {
          const offset = (v: number) =>
            21 * Math.sin(Math.PI * v) * Math.sin(4 * Math.PI * v + (group * 2 * Math.PI) / 3);
          return {
            ...mark,
            x: mark.x + nx * offset(t),
            y: mark.y + ny * offset(t),
            x2: mark.x2 + nx * offset(u),
            y2: mark.y2 + ny * offset(u),
            width: mark.width * 0.65,
          };
        }
        const span = 5 + mark.opacity * 13,
          centerX = (mark.x + mark.x2) / 2,
          centerY = (mark.y + mark.y2) / 2;
        const shift = (group - 1) * 4;
        return {
          ...mark,
          x: centerX + nx * (shift - span),
          y: centerY + ny * (shift - span),
          x2: centerX + nx * (shift + span),
          y2: centerY + ny * (shift + span),
          width: mark.width * 0.24,
          opacity: mark.opacity * 0.7,
        };
      }),
    );
  return [
    { id: "brush", label: "Dry brush", marks: transform("brush") },
    { id: "braid", label: "Three strands", marks: transform("braid") },
    { id: "hatch", label: "Hatching", marks: transform("hatch") },
  ];
}
