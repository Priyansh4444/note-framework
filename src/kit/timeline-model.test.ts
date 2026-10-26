import { expect, test } from "bun:test";
import { animationRail, curvedRail, playheadGrabOffset, playheadPath } from "./timeline-model";

test("rounded joins share tangents with both adjacent lines", () => {
  for (const height of [180, 280, 600]) {
    const { segments } = curvedRail(height);
    const direction = (x: number, y: number) => Math.atan2(y, x);
    for (const i of [1, 3]) {
      const curve = segments[i],
        before = segments[i - 1],
        after = segments[i + 1],
        c = curve.control!;
      expect(direction(c.x - curve.from.x, c.y - curve.from.y)).toBeCloseTo(
        direction(before.to.x - before.from.x, before.to.y - before.from.y),
        10,
      );
      expect(direction(curve.to.x - c.x, curve.to.y - c.y)).toBeCloseTo(
        direction(after.to.x - after.from.x, after.to.y - after.from.y),
        10,
      );
    }
  }
});

test("grabs preserve every part of the visible endpoint segment on both rails", () => {
  for (const rail of [curvedRail(280), animationRail(320)]) {
    for (const at of [0, rail.length / 2, rail.length]) {
      const start = Math.max(0, Math.min(rail.length - 24, at - 12));
      for (const offset of [0, 4, 12, 20, 24]) {
        const pointer = rail.pointAt(start + offset),
          projected = rail.project(pointer);
        expect(projected - playheadGrabOffset(rail, at, pointer)).toBeCloseTo(at, 7);
      }
    }
  }
});

test("arclength projection round trips across the bend and clamps beyond the ends", () => {
  for (const height of [180, 280, 600]) {
    const rail = curvedRail(height);
    for (let i = 0; i <= 100; i++) {
      const d = (rail.length * i) / 100;
      expect(rail.project(rail.pointAt(d))).toBeCloseTo(d, 7);
    }
    expect(rail.project({ x: 24, y: -100 })).toBe(0);
    expect(rail.project({ x: 72, y: 1000 })).toBe(rail.length);
    expect(rail.length).toBeGreaterThan(height - 48);
  }
});

test("S rail has tangent lobes, strictly increasing x and shared inverse projection", () => {
  for (const width of [96, 280, 350, 728, 980]) {
    const rail = animationRail(width);
    let previous = -Infinity;
    for (let i = 0; i <= 1000; i++) {
      const at = (rail.length * i) / 1000,
        point = rail.pointAt(at);
      expect(point.x).toBeGreaterThan(previous);
      expect(point.y).toBeGreaterThanOrEqual(20 - 0.001);
      expect(point.y).toBeLessThanOrEqual(68 + 0.001);
      expect(Math.abs(rail.project(point) - at)).toBeLessThan(0.001);
      previous = point.x;
    }
    const [a, b] = rail.segments;
    expect((a.to.y - a.control!.y) / (a.to.x - a.control!.x)).toBeCloseTo(
      (b.control!.y - b.from.y) / (b.control!.x - b.from.x),
      10,
    );
    for (const at of [0, rail.length / 2, rail.length]) {
      const points = playheadPath(rail, at)
        .split(/[ML]/)
        .filter(Boolean)
        .map((value) => value.split(" ").map(Number));
      const length = points
        .slice(1)
        .reduce((sum, p, i) => sum + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0);
      expect(length).toBeCloseTo(24, 2);
    }
  }
});
