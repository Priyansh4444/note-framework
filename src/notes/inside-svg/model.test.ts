import { describe, expect, test } from "bun:test";
import { orderFor, peelLayout, shapes, windowOffset } from "./model";

describe("one original SVG geometry", () => {
  test("order changes only the sun's place, preserving immutable shape records", () => {
    expect(Object.isFrozen(shapes)).toBe(true);
    expect(shapes.every(Object.isFrozen)).toBe(true);
    expect(orderFor(false)).toEqual(["sky", "sun", "rear", "front", "frame"]);
    expect(orderFor(true)).toEqual(["sky", "rear", "front", "sun", "frame"]);
    expect(orderFor(true).filter((id) => id !== "sun")).toEqual(
      orderFor(false).filter((id) => id !== "sun"),
    );
    expect(orderFor(false)).toBe(orderFor(false));
  });
  test("moving the window leaves the scenery untouched", () => {
    const original = JSON.stringify(shapes);
    expect(
      ["left", "center", "right"].map((s) => windowOffset(s as "left" | "center" | "right")),
    ).toEqual([-42, 0, 42]);
    expect(JSON.stringify(shapes)).toBe(original);
    expect(shapes.find((s) => s.id === "sun")).toMatchObject({ cx: 158, cy: 112, r: 35 });
  });
});

for (const width of [272, 342, 640, 720]) {
  test(`peel reserves readable, bounded endpoints and intermediate planes at ${width}px`, () => {
    const start = peelLayout(width, 0),
      end = peelLayout(width, 1);
    expect(new Set(start.planes.map((p) => `${p.x},${p.y},${p.width}`)).size).toBe(1);
    expect(end.planes.every((p) => p.width >= 120)).toBe(true);
    expect(peelLayout(width, 0.5).planes.every((p) => p.labelOpacity === 0)).toBe(true);
    expect(end.planes.every((p) => p.labelOpacity === 1)).toBe(true);
    for (const fraction of [0, 0.1, 0.25, 0.5, 0.75, 1]) {
      const layout = peelLayout(width, fraction);
      expect(layout.height).toBe(end.height);
      for (const plane of layout.planes) {
        expect(plane.x).toBeGreaterThanOrEqual(-0.001);
        expect(plane.x + plane.width).toBeLessThanOrEqual(width + 0.001);
        expect(plane.y + (plane.width * 260) / 300 + 28).toBeLessThanOrEqual(layout.height + 0.001);
      }
    }
    for (let a = 0; a < 5; a++)
      for (let b = a + 1; b < 5; b++) {
        const x = end.planes[a],
          y = end.planes[b];
        expect(
          Math.abs(x.x - y.x) >= x.width || Math.abs(x.y - y.y) >= (x.width * 260) / 300 + 28,
        ).toBe(true);
      }
  });
}
