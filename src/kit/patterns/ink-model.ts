export type InkMark = {
  x: number;
  y: number;
  x2: number;
  y2: number;
  width: number;
  opacity: number;
};
export type InkScene = { id: string; label: string; marks: readonly InkMark[] };
export type BrushOptions = { seed?: number; count?: number; width?: number };

const fields = ["x", "y", "x2", "y2", "width", "opacity"] as const;
export function validateInkScenes(scenes: readonly InkScene[]): readonly InkScene[] {
  if (!scenes.length) throw new Error("InkFigure needs at least one scene.");
  const ids = new Set<string>(),
    count = scenes[0].marks.length;
  if (!count) throw new Error("InkFigure scenes need at least one mark.");
  for (const scene of scenes) {
    if (!scene.id.trim() || ids.has(scene.id))
      throw new Error(`InkFigure scene IDs must be nonempty and unique: "${scene.id}".`);
    ids.add(scene.id);
    if (!scene.label.trim())
      throw new Error(`InkFigure scene "${scene.id}" needs a readable label.`);
    if (scene.marks.length !== count)
      throw new Error(
        `InkFigure scene "${scene.id}" has ${scene.marks.length} marks; expected ${count}. Preserve mark count and order across scenes.`,
      );
    scene.marks.forEach((mark, i) => {
      for (const key of fields)
        if (!Number.isFinite(mark[key]))
          throw new Error(`InkFigure scene "${scene.id}", mark ${i}: ${key} must be finite.`);
      if (mark.width <= 0)
        throw new Error(`InkFigure scene "${scene.id}", mark ${i}: width must be positive.`);
      if (mark.opacity < 0 || mark.opacity > 1)
        throw new Error(
          `InkFigure scene "${scene.id}", mark ${i}: opacity must be between 0 and 1.`,
        );
    });
  }
  return scenes;
}
export function validateInkViewBox(box: readonly [number, number, number, number]) {
  if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)
    throw new Error(
      "InkFigure viewBox must contain finite coordinates and positive width and height.",
    );
  return box;
}

/** Sample a polyline by distance, so extra vertices do not attract extra pigment. */
export function brushStroke(
  points: readonly (readonly [number, number])[],
  options: BrushOptions = {},
): readonly InkMark[] {
  const { seed = 1, count = 160, width = 3 } = options;
  if (points.length < 2 || points.some((p) => p.length !== 2 || !p.every(Number.isFinite)))
    throw new Error("brushStroke needs at least two finite [x, y] points.");
  if (!Number.isInteger(count) || count < 1 || count > 20000)
    throw new Error("brushStroke count must be an integer between 1 and 20000.");
  if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(seed))
    throw new Error("brushStroke needs a finite seed and positive finite width.");
  const lengths = [0];
  for (let i = 1; i < points.length; i++)
    lengths.push(
      lengths[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]),
    );
  const total = lengths[lengths.length - 1];
  if (!(total > 0) || !Number.isFinite(total))
    throw new Error("brushStroke needs a finite polyline with nonzero length.");
  const sample = (t: number): readonly [number, number] => {
    const distance = t * total;
    let low = 1,
      high = lengths.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (lengths[middle] < distance) low = middle + 1;
      else high = middle;
    }
    while (low < lengths.length - 1 && lengths[low] === lengths[low - 1]) low++;
    const a = points[low - 1],
      b = points[low],
      span = lengths[low] - lengths[low - 1];
    const u = span ? (distance - lengths[low - 1]) / span : 0;
    return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
  };
  let state = seed | 0;
  const random = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    const t = i / count,
      u = (i + 1) / count,
      a = sample(t),
      b = sample(u);
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = length ? -(b[1] - a[1]) / length : 0,
      ny = length ? (b[0] - a[0]) / length : 0;
    const offset = (random() - 0.5) * width * 1.3;
    const start = offset * Math.sin(Math.PI * t),
      end = offset * Math.sin(Math.PI * u);
    return {
      x: a[0] + nx * start,
      y: a[1] + ny * start,
      x2: b[0] + nx * end,
      y2: b[1] + ny * end,
      width: width * (0.22 + random() * 0.55),
      opacity: 0.28 + random() * 0.52,
    };
  });
}

export type InkPose = { marks: InkMark[]; velocities: InkMark[] };
export function createInkPose(marks: readonly InkMark[]): InkPose {
  return {
    marks: marks.map((mark) => ({ ...mark })),
    velocities: marks.map(() => ({ x: 0, y: 0, x2: 0, y2: 0, width: 0, opacity: 0 })),
  };
}
export function settleInkPose(pose: InkPose, target: readonly InkMark[]) {
  pose.marks.forEach((mark, i) => {
    for (const key of fields) {
      mark[key] = target[i][key];
      pose.velocities[i][key] = 0;
    }
  });
}
/** Exact critically damped response; retargeting never resets displayed position or velocity. */
export function advanceInkPose(pose: InkPose, target: readonly InkMark[], dt: number): boolean {
  if (!Number.isFinite(dt) || dt < 0)
    throw new Error("InkFigure: time must be finite and nonnegative.");
  if (pose.marks.length !== target.length)
    throw new Error("InkFigure: mounted mark correspondence must stay stable.");
  const omega = 8,
    decay = Math.exp(-omega * dt);
  let moving = false;
  pose.marks.forEach((mark, i) => {
    for (const key of fields) {
      const end = target[i][key],
        d = mark[key] - end,
        v = pose.velocities[i][key],
        h = v + omega * d;
      mark[key] = end + (d + h * dt) * decay;
      pose.velocities[i][key] = (v - omega * h * dt) * decay;
      if (Math.abs(mark[key] - end) > 0.0001 || Math.abs(pose.velocities[i][key]) > 0.0001)
        moving = true;
    }
  });
  if (!moving) settleInkPose(pose, target);
  return moving;
}
