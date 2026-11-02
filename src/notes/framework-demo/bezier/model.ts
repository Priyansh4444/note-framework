import { deCasteljau, lerp, pointAt, type Point } from "../examples/de-casteljau";

export type { Point };
export type Cubic = readonly [Point, Point, Point, Point];

/** Map each control point, keeping exactly four. */
export const mapCubic = (p: Cubic, f: (q: Point, i: number) => Point): Cubic => [
  f(p[0], 0),
  f(p[1], 1),
  f(p[2], 2),
  f(p[3], 3),
];

/** The figure's coordinate box. Control points stay inside it. */
export const BOX = { x: 0, y: 0, w: 560, h: 340, pad: 24 } as const;
export const START: Cubic = [
  [70, 270],
  [150, 60],
  [400, 50],
  [490, 250],
];

/** Readable starting cases; the straight preset also exercises zero flattening error. */
export const PRESETS = [
  { id: "arch", label: "Arch", points: START },
  {
    id: "bend",
    label: "S bend",
    points: [
      [70, 200],
      [200, 40],
      [360, 300],
      [490, 140],
    ],
  },
  {
    id: "line",
    label: "Straight",
    points: [
      [70, 170],
      [210, 170],
      [350, 170],
      [490, 170],
    ],
  },
] as const satisfies readonly { id: string; label: string; points: Cubic }[];

export const clampPoint = ([x, y]: Point): Point => [
  Math.min(BOX.x + BOX.w - BOX.pad, Math.max(BOX.x + BOX.pad, Math.round(x))),
  Math.min(BOX.y + BOX.h - BOX.pad, Math.max(BOX.y + BOX.pad, Math.round(y))),
];

const choose = (n: number, k: number) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
};
/** Bernstein weight of control point i in a degree-n curve. */
export const bernstein = (n: number, i: number, t: number) =>
  choose(n, i) * (1 - t) ** (n - i) * t ** i;
export const weights = (t: number) =>
  [0, 1, 2, 3].map((i) => bernstein(3, i, t)) as [number, number, number, number];

/** The same point, written as one weighted sum instead of nested mixing. */
export const weighted = (p: readonly Point[], t: number): Point => {
  const w = weights(t);
  return [w.reduce((s, wi, i) => s + wi * p[i][0], 0), w.reduce((s, wi, i) => s + wi * p[i][1], 0)];
};

export const construction = (p: Cubic, t: number) => deCasteljau(p, t);
export { pointAt, lerp };

/** Exact cubic restriction to [a, b]; endpoint derivatives give its inner controls. */
export function curvePath(p: Cubic, a = 0, b = 1): string {
  if (b <= a) return "";
  const start = pointAt(p, a),
    end = pointAt(p, b);
  const derivative = (t: number): Point => {
    const axis = (i: 0 | 1) =>
      3 *
      ((1 - t) ** 2 * (p[1][i] - p[0][i]) +
        2 * (1 - t) * t * (p[2][i] - p[1][i]) +
        t * t * (p[3][i] - p[2][i]));
    return [axis(0), axis(1)];
  };
  const da = derivative(a),
    db = derivative(b),
    span = (b - a) / 3;
  const first: Point = [start[0] + span * da[0], start[1] + span * da[1]];
  const last: Point = [end[0] - span * db[0], end[1] - span * db[1]];
  return `M${start[0]} ${start[1]}C${first[0]} ${first[1]} ${last[0]} ${last[1]} ${end[0]} ${end[1]}`;
}

/** Uniform chords: n straight segments whose ends lie on the curve at t = k/n. */
export const chords = (p: Cubic, n: number): Point[] =>
  Array.from({ length: n + 1 }, (_, k) => pointAt(p, k / n));

const dist = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The largest sampled gap between the curve and its n uniform chords, and where it is.
 * Sampling can only miss a larger gap, so this is a lower estimate of the true maximum.
 */
export function worstChordGap(p: Cubic, n: number, perSegment = 64) {
  let error = 0,
    at: [Point, Point] = [p[0], p[0]];
  for (let k = 0; k < n; k++) {
    const a = pointAt(p, k / n),
      b = pointAt(p, (k + 1) / n);
    for (let s = 0; s <= perSegment; s++) {
      const u = s / perSegment;
      const q = pointAt(p, (k + u) / n),
        c: Point = [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
      const d = dist(q, c);
      if (d > error) [error, at] = [d, [q, c]];
    }
  }
  return { error, at };
}

export const chordError = (p: Cubic, n: number, perSegment = 64) =>
  worstChordGap(p, n, perSegment).error;

/** max‖B''‖ for a cubic: B'' is linear in t, so the largest value is at an end. */
export const maxSecond = (p: Cubic) =>
  6 *
  Math.max(
    Math.hypot(p[0][0] - 2 * p[1][0] + p[2][0], p[0][1] - 2 * p[1][1] + p[2][1]),
    Math.hypot(p[1][0] - 2 * p[2][0] + p[3][0], p[1][1] - 2 * p[2][1] + p[3][1]),
  );
/** Interpolation bound h²/8 · max‖B''‖ with h = 1/n. */
export const chordBound = (p: Cubic, n: number) => maxSecond(p) / (8 * n * n);

/** Monotone-chain convex hull of the control points, used to draw the region the curve cannot leave. */
export function convexHull(points: readonly Point[]): Point[] {
  const s = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const q of list) {
      while (out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, q) <= 0) out.pop();
      out.push(q);
    }
    return out.slice(0, -1);
  };
  return s.length < 3 ? s : [...half(s), ...half(s.reverse())];
}
export const pathOf = (points: readonly Point[]) =>
  points.map((q, i) => `${i ? "L" : "M"}${q[0]} ${q[1]}`).join("") + "Z";
