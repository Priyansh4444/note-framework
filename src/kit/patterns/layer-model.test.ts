import { expect, test } from "bun:test";
import { advanceLayers, layerTarget, validateLayers } from "./layer-model";
test("layer retarget preserves pose and momentum and ends on the selected sheet", () => {
  const poses = [0, 1, 2].map((i) => ({ ...layerTarget(i, 0), vl: 0, vf: 0 }));
  const first = poses[0];
  advanceLayers(poses, 2, 0.12);
  const before = structuredClone(poses);
  advanceLayers(poses, 1, 0);
  expect(poses).toEqual(before);
  let moving = true;
  for (let i = 0; i < 600; i++) moving = advanceLayers(poses, 1, 1 / 60);
  expect(moving).toBe(false);
  expect(poses[0]).toBe(first);
  poses.forEach((p, i) => expect(p).toEqual({ ...layerTarget(i, 1), vl: 0, vf: 0 }));
});
test("layer author data requires readable IDs and meaningful finite path data", () => {
  const a = { id: "a", label: "A", paths: [{ d: "M0 0L100 100" }] };
  expect(validateLayers([a])).toEqual([a]);
  for (const bad of [[], [a, a], [{ ...a, paths: [] }], [{ ...a, paths: [{ d: "MNaN 0" }] }]])
    expect(() => validateLayers(bad)).toThrow();
});
test("layer path parsing rejects malformed commands and overflowing numeric coordinates", () => {
  for (const d of ["M0 0Lbogus", "M0 0L1e999 10", "M0 0C1 2 3", "L10 20", "M0 0A10 10 0 7 0 20 20"])
    expect(() => validateLayers([{ id: "a", label: "A", paths: [{ d }] }])).toThrow(/invalid SVG/);
  expect(
    validateLayers([
      { id: "a", label: "A", paths: [{ d: "M0 0C1 2 3 4 5 6Q7 8 9 10A10 10 0 0 1 20 20Z" }] },
    ]),
  ).toHaveLength(1);
});
