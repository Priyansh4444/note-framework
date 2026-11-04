import { expect, test } from "bun:test";
import {
  COMMANDS,
  d,
  fractionAt,
  LINES,
  lineThroughSlit,
  positionAt,
  stateAt,
  STEP_FRACTIONS,
} from "./path-model";

test("the finished state writes exactly the source's path, at the source's stroke", () => {
  const done = stateAt(LINES.length);
  expect(done.ink.replace(/\s+/g, " ")).toBe(d);
  expect(done.reached).toBe(COMMANDS);
  expect(done.width).toBe(6);
  expect(done.join).toBe("round");
  expect(done.pen).toEqual([59, 82]);
});

test("nothing is inked before the first command, and the pen only ever moves forward", () => {
  expect(stateAt(0).ink).toBe("");
  expect(stateAt(2).reached).toBe(0);
  let last = 0;
  for (let p = 0; p <= LINES.length; p += 0.01) {
    const { length, reached } = stateAt(p);
    expect(length).toBeGreaterThanOrEqual(last - 1e-6);
    expect(reached).toBeLessThanOrEqual(COMMANDS);
    last = length;
  }
});

test("a partly drawn cubic ends on the true curve, not a chord", () => {
  // Line 4 is C 31 10, 23 26, 23 45 from (50, 10). B(½) = (P₀ + 3P₁ + 3P₂ + P₃)/8.
  const { pen } = stateAt(3.5);
  expect(pen[0]).toBeCloseTo((50 + 3 * 31 + 3 * 23 + 23) / 8, 9);
  expect(pen[1]).toBeCloseTo((10 + 3 * 10 + 3 * 26 + 45) / 8, 9);
});

test("the stroke thickens only once the slit reaches its attribute", () => {
  const widthLine = LINES.findIndex((line) => line.text.includes("stroke-width"));
  const joinLine = LINES.findIndex((line) => line.text.includes("linejoin"));
  expect(stateAt(widthLine).width).toBeCloseTo(1.25, 9);
  expect(stateAt(widthLine + 1).width).toBeCloseTo(6, 9);
  expect(stateAt(joinLine).join).toBe("miter");
  expect(stateAt(joinLine + 1).join).toBe("round");
});

test("position and time invert, and reduced motion visits every line", () => {
  for (let p = 0; p <= LINES.length; p += 0.37) expect(positionAt(fractionAt(p))).toBeCloseTo(p, 6);
  expect(positionAt(0)).toBe(0);
  expect(positionAt(1)).toBe(LINES.length);
  expect(STEP_FRACTIONS).toHaveLength(LINES.length);
  for (let i = 1; i < STEP_FRACTIONS.length; i++)
    expect(STEP_FRACTIONS[i]).toBeGreaterThan(STEP_FRACTIONS[i - 1]);
});

test("the slit shows true text, and its noise holds still while the position does", () => {
  for (let i = 0; i < LINES.length; i++) {
    const seen = lineThroughSlit(i, 5);
    expect(seen.clear.length + seen.noise.length).toBe(LINES[i].text.length);
    expect(LINES[i].text.startsWith(seen.clear)).toBe(true);
    expect(seen.noise).toBe(lineThroughSlit(i, 5).noise);
  }
  expect(lineThroughSlit(4, 4.5).clear).toBe(LINES[4].text);
  expect(lineThroughSlit(LINES.length - 1, 0).clear).toBe("");
});
