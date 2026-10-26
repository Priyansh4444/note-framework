import { expect, test } from "bun:test";
import {
  distanceAtScroll,
  scrollAtDistance,
  readingMap,
  readingRail,
  distanceAtY,
} from "./wayfinder-model";
test("one chapter map round-trips between document scroll and rounded rail distance", () => {
  const rail = readingRail(420)!;
  const map = readingMap(
    [
      { scroll: 500, distance: distanceAtY(rail, 30) },
      { scroll: 1800, distance: distanceAtY(rail, 150) },
      { scroll: 2300, distance: distanceAtY(rail, 300) },
    ],
    6000,
    rail.length,
  );
  for (let y = 0; y <= 6000; y += 13)
    expect(scrollAtDistance(map, distanceAtScroll(map, y))).toBeCloseTo(y, 6);
  for (let d = 0; d <= rail.length; d += 0.7) {
    expect(distanceAtScroll(map, scrollAtDistance(map, d))).toBeCloseTo(d, 6);
    expect(rail.project(rail.pointAt(d))).toBeCloseTo(d, 6);
  }
  expect(rail.path).toContain("Q");
});
test("clamped, repeated, short and empty geometry cannot divide by zero or throw", () => {
  expect(readingRail(159)).toBeUndefined();
  expect(readingRail(NaN)).toBeUndefined();
  const map = readingMap(
    [
      { scroll: 0, distance: 10 },
      { scroll: 10, distance: 20 },
      { scroll: 10, distance: 30 },
      { scroll: 20, distance: 30 },
      { scroll: 40, distance: 90 },
    ],
    40,
    100,
  );
  expect(map).toEqual([
    { scroll: 0, distance: 0 },
    { scroll: 10, distance: 30 },
    { scroll: 40, distance: 100 },
  ]);
  expect(distanceAtScroll(readingMap([], 0, 100), 50)).toBe(0);
  expect(scrollAtDistance(readingMap([], 0, 100), 50)).toBe(0);
  for (let i = 0; i <= 40; i++)
    expect(scrollAtDistance(map, distanceAtScroll(map, i))).toBeCloseTo(i, 8);
});
