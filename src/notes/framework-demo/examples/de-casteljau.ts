export type Point = readonly [x: number, y: number];

/** Mix two numbers: t = 0 gives a and t = 1 gives b, exactly. */
export function lerp(a: number, b: number, t: number) {
  return (1 - t) * a + t * b;
}

export const mix = (p: Point, q: Point, t: number): Point => [
  lerp(p[0], q[0], t),
  lerp(p[1], q[1], t),
];

/** Mix neighbours level by level; the last level holds B(t). */
export function deCasteljau(points: readonly Point[], t: number) {
  const levels = [points.slice()];
  while (levels.at(-1)!.length > 1) {
    const row = levels.at(-1)!;
    levels.push(row.slice(1).map((q, i) => mix(row[i], q, t)));
  }
  return levels;
}

export function pointAt(points: readonly Point[], t: number) {
  return deCasteljau(points, t).at(-1)![0];
}
