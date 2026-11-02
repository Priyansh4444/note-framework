import { chordBound, lerp, pointAt, type Cubic, type Point } from "./model";

type Count = 1 | 2 | 4 | 8 | 16;
type State =
  | { kind: "settled"; n: Count }
  | { kind: "splitting"; from: Count; to: Count; alpha: number; stationary: boolean };
type Gap = { error: number; at: readonly [Point, Point] };
type Frame = {
  state: State;
  vertices: readonly Point[];
  gap: Gap;
  bound: number;
  dotOpacity: readonly number[];
  markerOpacity: number;
};

const COUNTS = [1, 2, 4, 8, 16] as const;
const GRID = 1024;
const STATIONARY_TRAVEL = 1e-8;
type Pacing = {
  stops: readonly [number, number, number, number, number];
  phaseAt: (ms: number) => number;
};
const slots = <T>(f: (index: number) => T): readonly T[] =>
  Array.from({ length: 17 }, (_, i) => f(i));
const ease = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : (1 - Math.cos(Math.PI * u)) / 2);

/**
 * Cache one control-point snapshot; time only blends its uniform polygons.
 * The grid contains every old 33-per-segment sample through n=32, so changing
 * stages cannot change the measurement grid and manufacture a jump in error.
 */
export function prepareRefinement(points: Cubic) {
  if (!points.every((p) => p.every(Number.isFinite)))
    throw new Error("Refinement needs finite control points.");
  const curve = Array.from({ length: GRID + 1 }, (_, i) => pointAt(points, i / GRID));
  const measure = (from: readonly Point[], to = from, alpha = 0) => {
    const distanceAt = (i: number) =>
      Math.hypot(
        curve[i][0] - lerp(from[i][0], to[i][0], alpha),
        curve[i][1] - lerp(from[i][1], to[i][1], alpha),
      );
    let error = 0,
      index = 0;
    for (let i = 0; i <= GRID; i++) {
      const distance = distanceAt(i);
      if (distance > error) {
        error = distance;
        index = i;
      }
    }
    const gap: Gap = {
      error,
      at: [
        curve[index],
        [lerp(from[index][0], to[index][0], alpha), lerp(from[index][1], to[index][1], alpha)],
      ],
    };
    // Symmetric lobes can trade the numerical maximum by rounding error even at
    // the envelope ends. Keep the exact winning witness, but suppress its ink
    // when a separated lobe ties it to floating-point precision.
    const tieTolerance = 128 * Number.EPSILON * Math.max(1, error);
    for (let i = 0; i <= GRID; i++) {
      if (Math.abs(i - index) > GRID / 16 && error - distanceAt(i) <= tieTolerance)
        return { gap, ambiguous: true };
    }
    return { gap, ambiguous: false };
  };
  const levels = [...COUNTS, 32].map((n) => {
    const grid = curve.map((_, i): Point => {
      const segment = Math.min(n - 1, Math.floor((i * n) / GRID));
      const u = (i * n) / GRID - segment;
      const a = curve[(segment * GRID) / n],
        b = curve[((segment + 1) * GRID) / n];
      return [lerp(a[0], b[0], u), lerp(a[1], b[1], u)];
    });
    return {
      n,
      grid,
      vertices: slots((j) => grid[(j * GRID) / 16]),
      measurement: measure(grid),
      bound: chordBound(points, n),
    };
  });
  const settled: readonly Frame[] = COUNTS.map((n, k) => ({
    state: { kind: "settled", n },
    vertices: levels[k].vertices,
    gap: levels[k].measurement.gap,
    bound: levels[k].bound,
    dotOpacity: slots((j) => (n < 16 && j % (16 / n) === 0 ? 1 : 0)),
    markerOpacity: levels[k].measurement.ambiguous ? 0 : 1,
  }));
  const travel = COUNTS.slice(0, 4).map((_, k) =>
    Math.max(
      ...levels[k].vertices.map((p, j) =>
        Math.hypot(p[0] - levels[k + 1].vertices[j][0], p[1] - levels[k + 1].vertices[j][1]),
      ),
    ),
  );

  return {
    series: levels.map((level) => ({
      n: level.n,
      error: level.measurement.gap.error,
      bound: level.bound,
    })),
    /** Presentation schedule for this snapshot, never an independent clock. */
    pacing(length: number): Pacing {
      const reserves = travel.map((distance) => (distance <= STATIONARY_TRAVEL ? 120 : 180));
      const reserved = reserves.reduce((sum, ms) => sum + ms, 0);
      if (!Number.isFinite(length) || length < reserved)
        throw new Error(`Refinement pacing needs at least ${reserved} finite milliseconds.`);
      const totalTravel = travel.reduce(
        (sum, distance) => sum + (distance <= STATIONARY_TRAVEL ? 0 : distance),
        0,
      );
      const durations = travel.map((distance, k) =>
        totalTravel === 0
          ? length / 4
          : reserves[k] +
            (distance <= STATIONARY_TRAVEL ? 0 : ((length - reserved) * distance) / totalTravel),
      );
      const stops: Pacing["stops"] = [
        0,
        durations[0],
        durations[0] + durations[1],
        durations[0] + durations[1] + durations[2],
        length,
      ];
      return {
        stops,
        phaseAt(ms) {
          if (!Number.isFinite(ms)) throw new Error("Refinement time must be finite.");
          const bounded = Math.max(0, Math.min(length, ms));
          for (let k = 0; k < 4; k++) {
            if (bounded <= stops[k + 1])
              return k + (bounded - stops[k]) / (stops[k + 1] - stops[k]);
          }
          return 4;
        },
      };
    },
    frame(phase: number): Frame {
      if (!Number.isFinite(phase)) throw new Error("Refinement phase must be finite.");
      const bounded = Math.max(0, Math.min(4, phase));
      if (Number.isInteger(bounded)) return settled[bounded];
      const k = Math.floor(bounded),
        u = bounded - k,
        // Geometry advances in proportion to scene time. Easing every split to
        // rest makes a continuous construction feel like repeated starts/stops.
        alpha = u;
      const from = levels[k],
        to = levels[k + 1];
      const measurement = measure(from.grid, to.grid, alpha);
      return {
        state: {
          kind: "splitting",
          from: COUNTS[k],
          to: COUNTS[k + 1],
          alpha,
          stationary: travel[k] <= STATIONARY_TRAVEL,
        },
        vertices: slots((j) => [
          lerp(from.vertices[j][0], to.vertices[j][0], alpha),
          lerp(from.vertices[j][1], to.vertices[j][1], alpha),
        ]),
        gap: measurement.gap,
        // B-Q = (1-alpha)(B-P_from) + alpha(B-P_to); triangle inequality
        // preserves a bound for the actual moving polygon, not just its endpoints.
        bound: lerp(from.bound, to.bound, alpha),
        dotOpacity: slots((j) => {
          const oldKnot = j % (16 / from.n) === 0;
          if (to.n === 16) return oldKnot ? 1 - alpha : 0;
          if (oldKnot) return 1;
          return j % (16 / to.n) === 0 ? alpha : 0;
        }),
        // A maximum may change lobes. Hide that search in the middle rather than
        // animating a fictitious witness between two genuine maximum-gap lines.
        markerOpacity: measurement.ambiguous
          ? 0
          : u < 0.15
            ? 1 - ease(u / 0.15)
            : u > 0.85
              ? ease((u - 0.85) / 0.15)
              : 0,
      };
    },
  };
}
