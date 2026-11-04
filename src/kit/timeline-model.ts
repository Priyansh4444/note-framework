export type RailPoint = Readonly<{ x: number; y: number }>;
export type RailSegment = Readonly<{ from: RailPoint; to: RailPoint; control?: RailPoint }>;
type Sample = RailPoint & { distance: number };
export interface Rail {
  readonly path: string;
  readonly length: number;
  readonly segments: readonly RailSegment[];
  pointAt(distance: number): RailPoint;
  project(point: RailPoint): number;
}
const mix = (a: RailPoint, b: RailPoint, t: number): RailPoint => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});
const distance = (a: RailPoint, b: RailPoint) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

/** A pixel-sized vertical–diagonal–vertical rail, with tangent quadratic joins. */
export function curvedRail(
  height: number,
  width = 96,
  shape: { inset?: number; cornerRadius?: number; bendHeight?: number } = {},
) {
  const { inset = 24, cornerRadius = 22, bendHeight = 70 } = shape;
  if (
    !Number.isFinite(height) ||
    height < 160 ||
    !Number.isFinite(width) ||
    width < 44 ||
    !Number.isFinite(inset) ||
    inset <= 0 ||
    inset * 2 >= width ||
    !Number.isFinite(cornerRadius) ||
    cornerRadius <= 0 ||
    !Number.isFinite(bendHeight) ||
    bendHeight <= 0
  )
    throw new Error("Rail needs finite positive geometry and at least 44 × 160 pixels.");
  const top = { x: inset, y: 24 },
    bottom = { x: width - inset, y: height - 24 };
  const span = bottom.y - top.y;
  const a = { x: top.x, y: top.y + span * 0.25 };
  // A fixed shallow kink near the top leaves a longer lower vertical, even when
  // wrapped labels grow the instrument. Keep room for both rounded joins.
  const b = { x: bottom.x, y: a.y + Math.min(bendHeight, span * 0.36) };
  const diagonal = distance(a, b);
  const trim = Math.min(cornerRadius, diagonal / 4, (a.y - top.y) / 2, (bottom.y - b.y) / 2);
  const beforeA = { x: a.x, y: a.y - trim },
    afterA = mix(a, b, trim / diagonal);
  const beforeB = mix(b, a, trim / diagonal),
    afterB = { x: b.x, y: b.y + trim };
  const segments: readonly RailSegment[] = [
    { from: top, to: beforeA },
    { from: beforeA, control: a, to: afterA },
    { from: afterA, to: beforeB },
    { from: beforeB, control: b, to: afterB },
    { from: afterB, to: bottom },
  ];
  return sampledRail(segments);
}

/** Two tangent lobes: x always increases, so dragging never meets a returning arm. */
export function animationRail(width: number): Rail {
  if (!Number.isFinite(width) || width < 96)
    throw new Error("Animation rail needs at least 96 pixels.");
  // The same shallow S as before (±22px), in a 64px band instead of 88px.
  const left = { x: 24, y: 32 },
    middle = { x: width / 2, y: 32 },
    right = { x: width - 24, y: 32 };
  const quarter = (width - 48) / 4;
  return sampledRail([
    { from: left, control: { x: left.x + quarter, y: -12 }, to: middle },
    { from: middle, control: { x: middle.x + quarter, y: 76 }, to: right },
  ]);
}

/** Drawing, distance and inverse projection share this one adaptive table. */
function sampledRail(segments: readonly RailSegment[]): Rail {
  const top = segments[0].from;
  const path =
    `M${top.x} ${top.y}` +
    segments
      .map((s) =>
        s.control ? `Q${s.control.x} ${s.control.y} ${s.to.x} ${s.to.y}` : `L${s.to.x} ${s.to.y}`,
      )
      .join("");
  const samples: Sample[] = [{ ...top, distance: 0 }];
  const add = (p: RailPoint) => {
    const previous = samples[samples.length - 1];
    samples.push({ ...p, distance: previous.distance + distance(previous, p) });
  };
  // Bound both sagitta and length error. This table serves forward and inverse
  // queries alike, so neither projection nor progress can silently use a y ratio.
  const flatten = (a: RailPoint, c: RailPoint, b: RailPoint, depth = 0) => {
    const ac = mix(a, c, 0.5),
      cb = mix(c, b, 0.5),
      middle = mix(ac, cb, 0.5);
    if (
      depth >= 18 ||
      (distance(middle, mix(a, b, 0.5)) < 0.002 &&
        distance(a, c) + distance(c, b) - distance(a, b) < 0.0001)
    ) {
      add(b);
      return;
    }
    flatten(a, ac, middle, depth + 1);
    flatten(middle, cb, b, depth + 1);
  };
  for (const segment of segments) {
    if (segment.control) flatten(segment.from, segment.control, segment.to);
    else add(segment.to);
  }
  const length = samples[samples.length - 1].distance;
  return {
    path,
    length,
    segments,
    pointAt(at: number): RailPoint {
      const d = clamp(at, length);
      let lo = 1,
        hi = samples.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (samples[mid].distance < d) lo = mid + 1;
        else hi = mid;
      }
      const a = samples[lo - 1],
        b = samples[lo];
      return mix(a, b, (d - a.distance) / (b.distance - a.distance));
    },
    project(point: RailPoint): number {
      let nearest = Infinity,
        at = 0;
      for (let i = 1; i < samples.length; i++) {
        const a = samples[i - 1],
          b = samples[i],
          dx = b.x - a.x,
          dy = b.y - a.y;
        const t = clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy), 1);
        const gap = distance(point, mix(a, b, t));
        if (gap < nearest) {
          nearest = gap;
          at = a.distance + t * (b.distance - a.distance);
        }
      }
      return at;
    },
  };
}

/** Keep a full 24px segment visible at either endpoint, following the actual rail. */
export function playheadPath(rail: Rail, distance: number, span = 24): string {
  const size = Math.min(span, rail.length);
  const start = Math.max(0, Math.min(rail.length - size, distance - size / 2));
  const count = Math.ceil(size);
  return Array.from({ length: count + 1 }, (_, i) => {
    const point = rail.pointAt(start + (size * i) / count);
    return `${i ? "L" : "M"}${point.x} ${point.y}`;
  }).join("");
}

/** Preserve grabs across the whole visible segment, including its shifted ends. */
export function playheadGrabOffset(rail: Rail, at: number, pointer: RailPoint): number {
  const projected = rail.project(pointer);
  const start = Math.max(0, Math.min(rail.length - 24, at - 12));
  const nearest = rail.pointAt(Math.max(start, Math.min(start + 24, projected)));
  return distance(pointer, nearest) <= 22 ? projected - at : 0;
}
