import { expect, test } from "bun:test";
import { advanceInkPose, brushStroke, createInkPose, validateInkScenes } from "./ink-model";
test("seeded brush resamples by distance rather than vertex density, retaining exact ends", () => {
  const a = brushStroke(
      [
        [0, 0],
        [100, 0],
      ],
      { seed: 17, count: 20, width: 4 },
    ),
    b = brushStroke(
      [
        [0, 0],
        [1, 0],
        [3, 0],
        [100, 0],
      ],
      { seed: 17, count: 20, width: 4 },
    );
  a.forEach((mark, i) => {
    expect(mark.x).toBeCloseTo(b[i].x, 10);
    expect(mark.y).toBeCloseTo(b[i].y, 10);
  });
  expect(a[0].x).toBe(0);
  expect(a.at(-1)!.x2).toBe(100);
  expect(a).toEqual(
    brushStroke(
      [
        [0, 0],
        [100, 0],
      ],
      { seed: 17, count: 20, width: 4 },
    ),
  );
  expect(a).not.toEqual(
    brushStroke(
      [
        [0, 0],
        [100, 0],
      ],
      { seed: 18, count: 20, width: 4 },
    ),
  );
});
test("ink retarget continues actual marks and velocity and settles without identity replacement", () => {
  const a = brushStroke(
      [
        [0, 0],
        [100, 0],
      ],
      { count: 20 },
    ),
    b = brushStroke(
      [
        [10, 100],
        [110, 100],
      ],
      { count: 20 },
    ),
    pose = createInkPose(a),
    first = pose.marks[0];
  advanceInkPose(pose, b, 0.15);
  const before = { ...first },
    velocity = { ...pose.velocities[0] };
  advanceInkPose(pose, a, 0);
  expect(first).toEqual(before);
  expect(pose.velocities[0]).toEqual(velocity);
  let moving = true;
  for (let i = 0; i < 600; i++) moving = advanceInkPose(pose, a, 1 / 60);
  expect(moving).toBe(false);
  expect(pose.marks[0]).toBe(first);
  expect(pose.marks).toEqual([...a]);
});
test("brush and scene boundaries reject incompatible or meaningless data", () => {
  for (const f of [
    () =>
      brushStroke([
        [0, 0],
        [0, 0],
      ]),
    () =>
      brushStroke(
        [
          [0, 0],
          [1, 1],
        ],
        { count: 0 },
      ),
    () =>
      brushStroke(
        [
          [0, 0],
          [1, 1],
        ],
        { width: -1 },
      ),
    () => validateInkScenes([]),
    () =>
      validateInkScenes([
        {
          id: "a",
          label: "A",
          marks: brushStroke(
            [
              [0, 0],
              [1, 1],
            ],
            { count: 2 },
          ),
        },
        {
          id: "b",
          label: "B",
          marks: brushStroke(
            [
              [0, 0],
              [1, 1],
            ],
            { count: 3 },
          ),
        },
      ]),
  ])
    expect(f).toThrow();
});
