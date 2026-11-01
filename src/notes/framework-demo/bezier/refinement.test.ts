import { expect, test } from "bun:test";
import {
  chordBound,
  chordError,
  chords,
  lerp,
  pointAt,
  PRESETS,
  START,
  type Cubic,
  type Point,
} from "./model";
import { prepareRefinement } from "./refinement";

const counts = [1, 2, 4, 8, 16] as const;
const deformed: Cubic = [
  [40, 300],
  [520, 40],
  [40, 40],
  [520, 300],
];
const degenerate: Cubic = [
  [150, 150],
  [150, 150],
  [150, 150],
  [150, 150],
];
const shapes: readonly Cubic[] = [...PRESETS.map((p) => p.points), deformed, degenerate];
const close = (a: Point, b: Point) => {
  expect(a[0]).toBeCloseTo(b[0], 10);
  expect(a[1]).toBeCloseTo(b[1], 10);
};
const onPolygon = (vertices: readonly Point[], t: number): Point => {
  const index = Math.min(vertices.length - 2, Math.floor(t * (vertices.length - 1)));
  const u = t * (vertices.length - 1) - index;
  return [
    lerp(vertices[index][0], vertices[index + 1][0], u),
    lerp(vertices[index][1], vertices[index + 1][1], u),
  ];
};

test("the five semantic stops are exact uniform polygons with seventeen persistent slots", () => {
  for (const p of shapes) {
    const prepared = prepareRefinement(p);
    for (const [phase, n] of counts.entries()) {
      const frame = prepared.frame(phase);
      expect(frame.state).toEqual({ kind: "settled", n });
      expect(frame.vertices).toHaveLength(17);
      expect(frame.dotOpacity).toHaveLength(17);
      const polygon = chords(p, n);
      for (let j = 0; j <= 16; j++) close(frame.vertices[j], onPolygon(polygon, j / 16));
      expect(frame.bound).toBe(chordBound(p, n));
      expect(frame.markerOpacity).toBeGreaterThanOrEqual(0);
      expect(frame.markerOpacity).toBeLessThanOrEqual(1);
    }
  }
});

test("new midpoints unfold from their parent chord while every old anchor stays fixed", () => {
  const prepared = prepareRefinement(START);
  for (let stage = 0; stage < 4; stage++) {
    const from = counts[stage],
      to = counts[stage + 1];
    const frame = prepared.frame(stage + 0.5);
    expect(frame.state.kind).toBe("splitting");
    if (frame.state.kind !== "splitting") throw new Error("Expected an unfolding stage");
    expect(frame.state.from).toBe(from);
    expect(frame.state.to).toBe(to);
    expect(frame.state.alpha).toBeCloseTo(0.5, 14);
    const coarse = chords(START, from);
    for (let j = 0; j <= 16; j += 16 / from) close(frame.vertices[j], pointAt(START, j / 16));
    for (let j = 16 / to; j < 16; j += 16 / from) {
      const start = onPolygon(coarse, j / 16),
        end = pointAt(START, j / 16);
      close(frame.vertices[j], [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2]);
      expect(Math.hypot(start[0] - end[0], start[1] - end[1])).toBeGreaterThan(0);
    }
  }
});

test("the reported maximum and its witness belong to the current visible interpolant", () => {
  for (const p of shapes) {
    const prepared = prepareRefinement(p);
    for (const phase of [0, 0.04, 0.5, 0.96, 1, 1.3, 2, 2.7, 3, 3.5, 3.99, 4]) {
      const frame = prepared.frame(phase);
      let maximum = 0,
        witnessOnGrid = false;
      for (let i = 0; i <= 1024; i++) {
        const q = pointAt(p, i / 1024),
          v = onPolygon(frame.vertices, i / 1024);
        maximum = Math.max(maximum, Math.hypot(q[0] - v[0], q[1] - v[1]));
        if (
          Math.hypot(q[0] - frame.gap.at[0][0], q[1] - frame.gap.at[0][1]) < 1e-9 &&
          Math.hypot(v[0] - frame.gap.at[1][0], v[1] - frame.gap.at[1][1]) < 1e-9
        )
          witnessOnGrid = true;
      }
      expect(frame.gap.error).toBeCloseTo(maximum, 9);
      expect(
        Math.hypot(
          frame.gap.at[0][0] - frame.gap.at[1][0],
          frame.gap.at[0][1] - frame.gap.at[1][1],
        ),
      ).toBeCloseTo(maximum, 9);
      expect(witnessOnGrid).toBe(true);
    }
  }
  const prepared = prepareRefinement(deformed);
  const middle = prepared.frame(0.5).gap.error;
  expect(
    Math.abs(middle - (prepared.frame(0).gap.error + prepared.frame(1).gap.error) / 2),
  ).toBeGreaterThan(0.01);
});

test("the blended interpolation bound remains valid for arch, bend, deformed, straight and collapsed curves", () => {
  for (const p of shapes) {
    const prepared = prepareRefinement(p);
    for (let i = 0; i <= 160; i++) {
      const frame = prepared.frame(i / 40);
      expect(frame.gap.error).toBeLessThanOrEqual(frame.bound + 1e-9);
      if (frame.state.kind === "splitting") {
        const { from, to, alpha } = frame.state;
        expect(frame.bound).toBeCloseTo(lerp(chordBound(p, from), chordBound(p, to), alpha), 12);
      }
    }
  }
});

test("chart rows use the same fixed grid and preserve all former 33-per-segment samples", () => {
  const prepared = prepareRefinement(START);
  expect(prepared.series.map((row) => row.n)).toEqual([1, 2, 4, 8, 16, 32]);
  for (const row of prepared.series) {
    expect(row.error).toBeCloseTo(chordError(START, row.n, 1024 / row.n), 10);
    expect(row.error).toBeGreaterThanOrEqual(chordError(START, row.n, 32) - 1e-10);
    if (row.n <= 16) expect(prepared.frame(Math.log2(row.n)).gap.error).toBe(row.error);
  }
});

test("reverse seeks reproduce exactly and fixed-grid maxima remain continuous at stage boundaries", () => {
  const prepared = prepareRefinement(START);
  for (const phase of [0.1, 0.91, 1, 1.8, 2.3, 3.1, 3.99]) {
    const before = prepared.frame(phase);
    prepared.frame(4);
    prepared.frame(0);
    expect(prepared.frame(phase)).toEqual(before);
  }
  for (const p of shapes) {
    const prepared = prepareRefinement(p);
    for (const stage of [1, 2, 3]) {
      const before = prepared.frame(stage - 0.0001),
        after = prepared.frame(stage + 0.0001);
      for (let j = 0; j <= 16; j++)
        expect(
          Math.hypot(
            before.vertices[j][0] - after.vertices[j][0],
            before.vertices[j][1] - after.vertices[j][1],
          ),
        ).toBeLessThan(0.00001);
      expect(Math.abs(before.gap.error - after.gap.error)).toBeLessThan(0.00001);
    }
  }
});

test("the last interval keeps moving until the exact sixteen-piece endpoint", () => {
  const prepared = prepareRefinement(START);
  expect(prepared.frame(3.2).vertices).not.toEqual(prepared.frame(3.8).vertices);
  expect(prepared.frame(3.8).vertices).not.toEqual(prepared.frame(4).vertices);
});

test("only active subdivision knots appear, with a quiet eight-to-sixteen fade", () => {
  const prepared = prepareRefinement(START);
  for (const phase of [0, 0.3, 1, 1.6, 2, 2.5, 3, 3.6, 4]) {
    const frame = prepared.frame(phase);
    const n = frame.state.kind === "settled" ? frame.state.n : frame.state.to;
    for (let j = 0; j <= 16; j++) {
      expect(frame.dotOpacity[j]).toBeGreaterThanOrEqual(0);
      expect(frame.dotOpacity[j]).toBeLessThanOrEqual(1);
      if (j % (16 / n) !== 0) expect(frame.dotOpacity[j]).toBe(0);
    }
  }
  expect(prepared.frame(4).dotOpacity.every((value) => value === 0)).toBe(true);
  expect(prepared.frame(3.5).dotOpacity[2]).toBeCloseTo(0.5, 12);
  expect(prepared.frame(3.5).dotOpacity[1]).toBe(0);
});

test("gap witnesses fade only at stage ends, and zero error stays zero", () => {
  const prepared = prepareRefinement(START);
  for (let stage = 0; stage < 4; stage++) {
    expect(prepared.frame(stage + 0.05).markerOpacity).toBeGreaterThan(0);
    expect(prepared.frame(stage + 0.5).markerOpacity).toBe(0);
    expect(prepared.frame(stage + 0.95).markerOpacity).toBeGreaterThan(0);
  }
  for (const p of [PRESETS[2].points, degenerate]) {
    const straight = prepareRefinement(p);
    for (const phase of [0, 0.3, 1, 2.5, 3.99, 4])
      expect(straight.frame(phase).gap.error).toBeLessThan(1e-10);
  }
});

test("separated tied maxima never flash between the symmetric S bend's lobes", () => {
  const prepared = prepareRefinement(PRESETS[1].points);
  for (const phase of [0, 0.04, 0.96, 1, 1.04, 1.96, 2, 2.04, 2.96, 3, 3.04]) {
    const frame = prepared.frame(phase);
    expect(frame.markerOpacity).toBe(0);
    expect(frame.gap.error).toBeGreaterThan(0);
  }
});

test("finite seeks clamp to the scene, invalid phases and control points fail at the boundary", () => {
  const prepared = prepareRefinement(START);
  expect(prepared.frame(-1)).toEqual(prepared.frame(0));
  expect(prepared.frame(5)).toEqual(prepared.frame(4));
  for (const phase of [NaN, Infinity, -Infinity]) expect(() => prepared.frame(phase)).toThrow();
  expect(() => prepareRefinement([[NaN, 0], START[1], START[2], START[3]])).toThrow();
});
