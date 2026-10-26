import { expect, test } from "bun:test";
import {
  createMorphModel,
  makeMorphShapes,
  resampleContour,
  validateMorphShapes,
  type MorphShape,
} from "./morph-model";
const shapes = (): MorphShape[] => [
  {
    id: "a",
    label: "A",
    contours: [
      [
        [0, 0],
        [10, 0],
        [0, 10],
      ],
    ],
  },
  {
    id: "b",
    label: "B",
    filled: false,
    contours: [
      [
        [10, 20],
        [30, 20],
        [10, 40],
      ],
    ],
  },
];
test("morph retarget preserves all current coordinates and velocities; settling reaches the exact last destination", () => {
  const m = createMorphModel(shapes(), "a"),
    first = m.contours[0][0];
  m.setTarget("b");
  for (let i = 0; i < 12; i++) m.step(1 / 60);
  const before = m.snapshot();
  expect(before.contours[0][0].x).toBeGreaterThan(0);
  expect(before.contours[0][0].x).toBeLessThan(10);
  m.setTarget("a");
  expect(m.snapshot().contours).toEqual(before.contours);
  expect(m.snapshot().fill).toBe(before.fill);
  expect(m.snapshot().fillVelocity).toBe(before.fillVelocity);
  for (let i = 0; i < 600; i++) m.step(1 / 60);
  expect(m.moving).toBe(false);
  expect(m.contours[0][0]).toBe(first);
  expect(first).toEqual({ x: 0, y: 0, vx: 0, vy: 0 });
  expect(m.fill).toBe(1);
});
test("reactive replacement geometry has the same retained correspondence and uses new targets", () => {
  const source = shapes(),
    m = createMorphModel(source, "a");
  const next = shapes();
  next[0].contours = [
    [
      [3, 4],
      [13, 4],
      [3, 14],
    ],
  ];
  m.setShapes(next);
  m.setTarget("a");
  m.snap();
  expect(m.contours[0][0].x).toBe(3);
  expect(m.snapshot().identitiesStable).toBe(true);
  expect(() =>
    m.setShapes([
      {
        ...next[0],
        contours: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
          ],
        ],
      },
    ]),
  ).toThrow(/correspondence/);
});
test("author correspondence fails for malformed coordinates, IDs and point counts", () => {
  const invalid: MorphShape[][] = [
    [],
    [shapes()[0], shapes()[0]],
    [shapes()[0], { ...shapes()[1], contours: [] }],
    [
      {
        ...shapes()[0],
        contours: [
          [
            [0, 0],
            [NaN, 1],
            [0, 2],
          ],
        ],
      },
    ],
  ];
  for (const bad of invalid) expect(() => validateMorphShapes(bad)).toThrow();
  const m = createMorphModel(shapes(), "a");
  expect(() => m.setTarget("missing")).toThrow(/unknown/);
  expect(() => m.step(NaN)).toThrow(/finite/);
});
test("arc-length resampling closes a square with uniform samples and supports the original formations", () => {
  expect(
    resampleContour(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      8,
    ),
  ).toEqual([
    [0, 0],
    [5, 0],
    [10, 0],
    [10, 5],
    [10, 10],
    [5, 10],
    [0, 10],
    [0, 5],
  ]);
  expect(() =>
    resampleContour(
      [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      8,
    ),
  ).toThrow(/perimeter/);
  const states = makeMorphShapes();
  validateMorphShapes(states);
  expect(states.map((s) => s.contours.length)).toEqual([32, 32, 32, 32]);
  expect(states[1].filled).toBe(false);
});
