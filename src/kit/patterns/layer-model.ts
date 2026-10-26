import { SVGPathData } from "svg-pathdata";
export type FigureLayer = {
  id: string;
  label: string;
  paths: readonly { d: string; role?: "ink" | "quiet" | "accent" }[];
};
export type LayerPose = { lift: number; fan: number; vl: number; vf: number };
export function validateLayers(layers: readonly FigureLayer[]) {
  if (!layers.length || layers.length > 8)
    throw new Error("LayerFigure: provide between one and eight layers.");
  const ids = new Set<string>();
  for (const layer of layers) {
    if (!layer.id.trim() || ids.has(layer.id) || !layer.label.trim())
      throw new Error("LayerFigure: each layer needs a unique nonempty ID and visible label.");
    ids.add(layer.id);
    if (!layer.paths.length)
      throw new Error(`LayerFigure: layer “${layer.id}” needs at least one path.`);
    layer.paths.forEach((path) => {
      try {
        const commands = SVGPathData.parse(path.d);
        if (
          !commands.length ||
          commands[0].type !== SVGPathData.MOVE_TO ||
          commands.some((command) =>
            Object.values(command).some(
              (value) => typeof value === "number" && !Number.isFinite(value),
            ),
          )
        )
          throw new Error("coordinates must be finite and the path must begin with a move");
        if (path.role && !["ink", "quiet", "accent"].includes(path.role))
          throw new Error("unsupported role");
      } catch (error) {
        throw new Error(
          `LayerFigure: layer “${layer.id}” has invalid SVG path data: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error },
        );
      }
    });
  }
  return layers;
}
export const layerTarget = (i: number, selected: number, count = 3) => ({
  lift: (i === selected ? 64 : 0) - i * Math.min(25, 120 / count),
  fan: i < selected ? -9 : i > selected ? 9 : 0,
});
/** Exact critically damped response. A new choice keeps both displayed pose and velocity. */
export function advanceLayers(poses: LayerPose[], selected: number, dt: number) {
  if (!Number.isFinite(dt) || dt < 0)
    throw new Error("LayerFigure: time must be finite and nonnegative.");
  let moving = false;
  poses.forEach((pose, i) => {
    const target = layerTarget(i, selected, poses.length),
      decay = Math.exp(-9 * dt);
    for (const [field, velocity] of [
      ["lift", "vl"],
      ["fan", "vf"],
    ] as const) {
      const d = pose[field] - target[field],
        h = pose[velocity] + 9 * d;
      pose[field] = target[field] + (d + h * dt) * decay;
      pose[velocity] = (pose[velocity] - 9 * h * dt) * decay;
      if (Math.abs(pose[field] - target[field]) > 0.002 || Math.abs(pose[velocity]) > 0.002)
        moving = true;
    }
  });
  if (!moving)
    poses.forEach((p, i) =>
      Object.assign(p, layerTarget(i, selected, poses.length), { vl: 0, vf: 0 }),
    );
  return moving;
}
