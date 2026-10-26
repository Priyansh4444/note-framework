/** Closed contours correspond by array index, including their starting vertex and winding. */
export type MorphPoint = readonly [number, number];
export type MorphShape = {
  id: string;
  label: string;
  filled?: boolean;
  contours: readonly (readonly MorphPoint[])[];
};
export type MorphVertex = { x: number; y: number; vx: number; vy: number };

export function validateMorphShapes(shapes: readonly MorphShape[]): void {
  if (!shapes.length) throw new Error("MorphFigure: provide at least one shape.");
  const ids = new Set<string>();
  const reference = shapes[0].contours;
  for (const shape of shapes) {
    if (!shape.id.trim() || ids.has(shape.id))
      throw new Error(
        `MorphFigure: shape IDs must be nonempty and unique (received “${shape.id}”).`,
      );
    ids.add(shape.id);
    if (shape.filled !== undefined && typeof shape.filled !== "boolean")
      throw new Error("MorphFigure: filled must be a boolean.");
    if (!shape.label.trim())
      throw new Error(`MorphFigure: shape “${shape.id}” needs a visible label.`);
    if (!shape.contours.length || shape.contours.length !== reference.length) {
      throw new Error(
        `MorphFigure: shape “${shape.id}” needs ${reference.length || "at least one"} corresponding contours; received ${shape.contours.length}.`,
      );
    }
    shape.contours.forEach((contour, i) => {
      if (contour.length < 3 || contour.length !== reference[i].length) {
        throw new Error(
          `MorphFigure: shape “${shape.id}”, contour ${i + 1} needs ${reference[i].length} corresponding points (at least 3); received ${contour.length}. Resample explicitly and align starting vertices/winding.`,
        );
      }
      contour.forEach((point, j) => {
        if (point.length !== 2 || !point.every(Number.isFinite))
          throw new Error(
            `MorphFigure: shape “${shape.id}”, contour ${i + 1}, point ${j + 1} must contain two finite coordinates.`,
          );
      });
    });
  }
}

/** Allocation is permanent. Retargeting replaces only the destination, never position or velocity. */
export function createMorphModel(initialShapes: readonly MorphShape[], initialId: string) {
  validateMorphShapes(initialShapes);
  let shapes = initialShapes;
  const find = (id: string) => {
    const shape = shapes.find((shape) => shape.id === id);
    if (!shape)
      throw new Error(
        `MorphFigure: unknown shape “${id}”. Choose one of: ${shapes.map((s) => s.id).join(", ")}.`,
      );
    return shape;
  };
  let target = find(initialId);
  const contours = target.contours.map((contour) =>
    contour.map(([x, y]) => ({ x, y, vx: 0, vy: 0 })),
  );
  const originalContours = contours.slice();
  const originalPoints = contours.map((contour) => contour.slice());
  let moving = false,
    fill = target.filled === false ? 0 : 1,
    fillVelocity = 0;
  function snap() {
    contours.forEach((contour, i) =>
      contour.forEach((point, j) => {
        [point.x, point.y] = target.contours[i][j];
        point.vx = point.vy = 0;
      }),
    );
    fill = target.filled === false ? 0 : 1;
    fillVelocity = 0;
    moving = false;
  }
  return {
    contours,
    get fill() {
      return fill;
    },
    get selected() {
      return target.id;
    },
    get moving() {
      return moving;
    },
    setTarget(id: string) {
      const next = find(id);
      if (next !== target) {
        target = next;
        moving = true;
      }
    },
    setShapes(next: readonly MorphShape[]) {
      validateMorphShapes(next);
      if (
        next[0].contours.length !== contours.length ||
        next[0].contours.some((c, i) => c.length !== contours[i].length)
      ) {
        throw new Error(
          "MorphFigure: changing mounted contour correspondence is unsupported. Keep contour and point counts stable, or mount a new figure.",
        );
      }
      shapes = next;
    },
    snap,
    step(seconds: number): boolean {
      if (!Number.isFinite(seconds) || seconds < 0)
        throw new Error("MorphFigure: spring time must be finite and nonnegative.");
      if (!moving || seconds === 0) return moving;
      const dt = Math.min(seconds, 1 / 30),
        steps = Math.ceil(dt / (1 / 120)),
        h = dt / steps;
      for (let s = 0; s < steps; s++) {
        fillVelocity +=
          (115 * ((target.filled === false ? 0 : 1) - fill) - 19.5 * fillVelocity) * h;
        fill += fillVelocity * h;
        contours.forEach((contour, i) =>
          contour.forEach((point, j) => {
            const [x, y] = target.contours[i][j];
            point.vx += (115 * (x - point.x) - 19.5 * point.vx) * h;
            point.vy += (115 * (y - point.y) - 19.5 * point.vy) * h;
            point.x += point.vx * h;
            point.y += point.vy * h;
          }),
        );
      }
      let energy = Math.max(
        Math.abs(fill - (target.filled === false ? 0 : 1)),
        Math.abs(fillVelocity),
      );
      contours.forEach((contour, i) =>
        contour.forEach((point, j) => {
          energy = Math.max(
            energy,
            Math.abs(point.x - target.contours[i][j][0]),
            Math.abs(point.y - target.contours[i][j][1]),
            Math.abs(point.vx),
            Math.abs(point.vy),
          );
        }),
      );
      if (energy <= 0.035) snap();
      return moving;
    },
    snapshot() {
      return {
        selected: target.id,
        moving,
        fill,
        fillVelocity,
        identitiesStable: contours.every(
          (contour, i) =>
            contour === originalContours[i] &&
            contour.every((point, j) => point === originalPoints[i][j]),
        ),
        contours: contours.map((contour) => contour.map((point) => ({ ...point }))),
      };
    },
  };
}

/** Uniform arc-length sampling of a closed polygon. Does not choose correspondence for you. */
export function resampleContour(points: readonly MorphPoint[], count: number): MorphPoint[] {
  if (
    points.length < 3 ||
    points.some((point) => point.length !== 2 || !point.every(Number.isFinite))
  )
    throw new Error("resampleContour: provide at least three finite points.");
  if (!Number.isSafeInteger(count) || count < 3)
    throw new Error("resampleContour: count must be an integer of at least 3.");
  const lengths = points.map((a, i) => {
    const b = points[(i + 1) % points.length];
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  const perimeter = lengths.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(perimeter) || perimeter === 0)
    throw new Error("resampleContour: polygon needs a finite, nonzero perimeter.");
  let edge = 0,
    offset = 0;
  return Array.from({ length: count }, (_, i) => {
    const distance = (i / count) * perimeter;
    while (edge < lengths.length - 1 && offset + lengths[edge] <= distance)
      offset += lengths[edge++];
    const a = points[edge],
      b = points[(edge + 1) % points.length],
      t = lengths[edge] ? (distance - offset) / lengths[edge] : 0;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  });
}

/** The original Form / Shift study's four corresponding 32 × 32 contour sets. */
export function makeMorphShapes(): MorphShape[] {
  const shapes: MorphShape[] = ["Type", "Grid", "Ring", "Fold"].map((label) => ({
    id: label.toLowerCase(),
    label,
    contours: [],
  }));
  const targets: MorphPoint[][][] = [[], [], [], []];
  const tau = Math.PI * 2;
  const strokes: MorphPoint[][] = [
    [
      [270, 190],
      [350, 190],
      [350, 510],
      [270, 510],
    ],
    [
      [350, 190],
      [500, 375],
      [500, 500],
      [350, 310],
    ],
    [
      [500, 375],
      [650, 190],
      [650, 310],
      [500, 500],
    ],
    [
      [650, 190],
      [730, 190],
      [730, 510],
      [650, 510],
    ],
  ];
  // Preserve the study's eight samples on each edge, including its vertex alignment.
  const polygon = (corners: MorphPoint[]) =>
    corners.flatMap((a, edge) => {
      const b = corners[(edge + 1) % corners.length];
      return Array.from({ length: 8 }, (_, j): MorphPoint => [
        a[0] + ((b[0] - a[0]) * j) / 8,
        a[1] + ((b[1] - a[1]) * j) / 8,
      ]);
    });
  const lerp = (a: MorphPoint, b: MorphPoint, t: number): MorphPoint => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  for (let i = 0; i < 32; i++) {
    const [a, b, c, d] = strokes[Math.floor(i / 8)],
      lo = (i % 8) / 8,
      hi = Math.min(1, ((i % 8) + 1) / 8 + 0.002);
    targets[0].push(polygon([lerp(a, d, lo), lerp(b, c, lo), lerp(b, c, hi), lerp(a, d, hi)]));
    const col = i % 8,
      row = Math.floor(i / 8),
      x = 230 + col * 65 + (row % 2) * 15,
      y = 175 + row * 94 + (col % 3) * 13;
    const w = 52 + ((i * 29) % 67),
      h = 58 + ((i * 17) % 69);
    targets[1].push(
      polygon([
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ]),
    );
    const start = -Math.PI / 2 + (i / 32) * tau,
      end = start + tau / 32 + 0.001;
    targets[2].push([
      ...Array.from({ length: 16 }, (_, p): MorphPoint => {
        const t = start + ((end - start) * p) / 15;
        return [500 + 211 * Math.cos(t), 350 + 211 * Math.sin(t)];
      }),
      ...Array.from({ length: 16 }, (_, p): MorphPoint => {
        const t = end - ((end - start) * p) / 15;
        return [500 + 169 * Math.cos(t), 350 + 169 * Math.sin(t)];
      }),
    ]);
    const a1 = start + tau / 32,
      r = i % 2 ? 150 : 228,
      next = i % 2 ? 228 : 150;
    targets[3].push(
      polygon([
        [500 + 35 * Math.cos(start), 350 + 35 * Math.sin(start)],
        [500 + r * Math.cos(start), 350 + r * Math.sin(start)],
        [500 + next * Math.cos(a1), 350 + next * Math.sin(a1)],
        [500 + 35 * Math.cos(a1), 350 + 35 * Math.sin(a1)],
      ]),
    );
  }
  return shapes.map((shape, i) => ({ ...shape, filled: i !== 1, contours: targets[i] }));
}
