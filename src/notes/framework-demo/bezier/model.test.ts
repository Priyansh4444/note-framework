import { expect, test } from "bun:test";
import {
  bernstein,
  curvePath,
  chordBound,
  chordError,
  chords,
  clampPoint,
  construction,
  convexHull,
  mapCubic,
  maxSecond,
  pointAt,
  PRESETS,
  START,
  weighted,
  weights,
  type Cubic,
  type Point,
} from "./model";

const sample = (n = 200) => Array.from({ length: n + 1 }, (_, k) => k / n);
const close = (a: Point, b: Point, digits = 9) => {
  expect(a[0]).toBeCloseTo(b[0], digits);
  expect(a[1]).toBeCloseTo(b[1], digits);
};
const shapes: Cubic[] = [
  START,
  [
    [40, 300],
    [520, 40],
    [40, 40],
    [520, 300],
  ],
  [
    [100, 100],
    [100, 100],
    [400, 300],
    [400, 300],
  ],
  [
    [60, 200],
    [200, 200],
    [340, 200],
    [480, 200],
  ],
];

test("the curve starts and ends exactly on its first and last control points", () => {
  for (const p of shapes) {
    expect(pointAt(p, 0)).toEqual(p[0]);
    expect(pointAt(p, 1)).toEqual(p[3]);
  }
  // The example in the text: x runs from 0.1 to 0.45.
  const p: Cubic = [
    [0.1, 0],
    [0.2, 1],
    [0.3, 1],
    [0.45, 0],
  ];
  expect(pointAt(p, 1)[0]).toBe(0.45);
});

test("the imprecise lerp misses b at t = 1 for the values quoted in the text", () => {
  const imprecise = (a: number, b: number, t: number) => a + (b - a) * t;
  expect(imprecise(0.1, 0.45, 1)).toBe(0.44999999999999996);
  expect(imprecise(0.1, 0.45, 1)).not.toBe(0.45);
  expect((1 - 1) * 0.1 + 1 * 0.45).toBe(0.45);
});

test("nested mixing equals the Bernstein weighted sum", () => {
  for (const p of shapes) for (const t of sample()) close(pointAt(p, t), weighted(p, t));
});

test("construction levels have 4, 3, 2 and 1 points, each on the segment above it", () => {
  for (const t of [0, 0.25, 0.5, 0.8, 1]) {
    const levels = construction(START, t);
    expect(levels.map((l) => l.length)).toEqual([4, 3, 2, 1]);
    for (let l = 1; l < 4; l++)
      for (let i = 0; i < levels[l].length; i++) {
        const [a, b] = [levels[l - 1][i], levels[l - 1][i + 1]];
        close(levels[l][i], [(1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]]);
      }
  }
});

test("weights are nonnegative, sum to one, and match the stated values", () => {
  for (const t of sample()) {
    const w = weights(t);
    expect(Math.min(...w)).toBeGreaterThanOrEqual(0);
    expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  }
  expect(weights(0.5)).toEqual([0.125, 0.375, 0.375, 0.125]);
  expect(weights(0)).toEqual([1, 0, 0, 0]);
  expect(bernstein(3, 1, 1 / 3)).toBeCloseTo(4 / 9, 12); // the largest P1 weight
  for (const t of sample(1000)) expect(bernstein(3, 1, t)).toBeLessThanOrEqual(4 / 9 + 1e-12);
});

test("every sampled curve point lies inside the control points' convex hull", () => {
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  for (const p of shapes.slice(0, 2)) {
    const hull = convexHull(p);
    for (const t of sample()) {
      const q = pointAt(p, t);
      const signs = hull.map((a, i) => cross(a, hull[(i + 1) % hull.length], q));
      expect(signs.every((s) => s >= -1e-9) || signs.every((s) => s <= 1e-9)).toBe(true);
    }
  }
});

test("chord error stays under h²/8·max‖B''‖ and shrinks by about four when n doubles", () => {
  for (const p of shapes.slice(0, 2))
    for (const n of [1, 2, 3, 4, 8, 16, 32, 64])
      expect(chordError(p, n)).toBeLessThanOrEqual(chordBound(p, n) + 1e-9);
  for (const n of [8, 16, 32]) {
    const ratio = chordError(START, n) / chordError(START, 2 * n);
    expect(ratio).toBeGreaterThan(3.6);
    expect(ratio).toBeLessThan(4.4);
  }
  expect(chords(START, 4)).toHaveLength(5);
  // Collinear, evenly spaced control points: a straight line has zero second derivative and zero error.
  expect(maxSecond(shapes[3])).toBe(0);
  expect(chordError(shapes[3], 3)).toBeLessThan(1e-9);
});

test("dragged points stay inside the figure box on whole units", () => {
  expect(clampPoint([-50, 1000])).toEqual([24, 316]);
  expect(clampPoint([100.4, 99.6])).toEqual([100, 100]);
});

test("the named straight preset is exact and all presets stay inside the drag bounds", () => {
  for (const preset of PRESETS) for (const q of preset.points) expect(clampPoint(q)).toEqual(q);
  const line = PRESETS.find((p) => p.id === "line")!.points;
  expect(maxSecond(line)).toBe(0);
  expect(chordBound(line, 1)).toBe(0);
  for (const t of sample()) close(pointAt(line, t), [(1 - t) * line[0][0] + t * line[3][0], 170]);
});

test("the rendered cubic restriction evaluates to the original curve, including its endpoints", () => {
  for (const p of shapes)
    for (const [a, b] of [
      [0, 1],
      [0, 0.1234567],
      [0.23, 0.89],
      [0.999, 1],
    ]) {
      const path = curvePath(p, a, b);
      expect(path).not.toContain("L");
      const numbers = path.match(/[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/gi)!.map(Number);
      const restricted = mapCubic(p, (_, i) => [numbers[i * 2], numbers[i * 2 + 1]]);
      for (const u of [0, 0.17, 0.5, 0.81, 1])
        close(pointAt(restricted, u), pointAt(p, a + u * (b - a)), 8);
    }
  expect(curvePath(START, 0.5, 0.5)).toBe("");
});
