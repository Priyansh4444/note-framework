import { expect, test } from "bun:test";
import { createRoot } from "solid-js";
import { createScene } from "../post/scene/clock";
import { createPlayback, playbackDomain } from "./playback";

test("continuous playback preserves sub-step geometry and reverses exactly", () => {
  const domain = playbackDomain({ min: -2, max: 3, initial: 0.5 }, 6000);
  for (const value of [-2, -0.1234567, 0.99, 3])
    expect(domain.value(domain.time(value))).toBeCloseTo(value, 12);
  expect(domain.value(-10)).toBe(-2);
  expect(domain.value(7000)).toBe(3);
});

test("discrete playback gives every integer a full bin, including the last", () => {
  const domain = playbackDomain({ min: 1, max: 32, initial: 4, step: 1 }, 3200);
  for (let n = 1; n <= 32; n++) {
    expect(domain.value(domain.time(n))).toBe(n);
    expect(domain.value(domain.time(n) + 99.99)).toBe(n);
  }
  expect(domain.value(3200)).toBe(32);
  expect(() => playbackDomain({ min: 1, max: 2, initial: 1, step: 0.3 }, 100)).toThrow();
});

test("the binding initializes once and choices are clock seeks, without another value owner", () => {
  createRoot((dispose) => {
    const scene = createScene([{ label: "Sweep", ms: 6000 }]);
    const playback = createPlayback(scene, { min: 0, max: 1, initial: 0.5 });
    expect(scene.t()).toBe(3000);
    playback.seek(0.99);
    expect(scene.t()).toBe(5940);
    expect(scene.playing()).toBe(false);
    scene.seek(1234.567);
    expect(playback.value()).toBeCloseTo(1234.567 / 6000, 12);
    dispose();
  });
});

test("invalid domain specifications fail before changing a scene", () => {
  for (const spec of [
    { min: 0, max: Infinity, initial: 0 },
    { min: -Number.MAX_VALUE, max: Number.MAX_VALUE, initial: 0 },
    { min: 0, max: 1, initial: NaN },
    { min: 0, max: 1, initial: 0, step: 0 },
    { min: 0, max: 1, initial: 0, step: Number.MIN_VALUE },
  ])
    expect(() => playbackDomain(spec, 1000)).toThrow();
  expect(() => playbackDomain({ min: 0, max: 1, initial: 0 }, 0)).toThrow();
});

test("discrete seeks round trip for non-power-of-two bins with ordered adjacent floats", () => {
  const adjacent = (value: number, direction: 1 | -1) => {
    const number = new Float64Array([value]);
    const bits = new BigUint64Array(number.buffer);
    bits[0] += BigInt(direction);
    return number[0];
  };
  for (const bins of [3, 6, 7, 9, 10, 17, 31, 32])
    for (const length of [7, 1000, 3333, 9600]) {
      const domain = playbackDomain({ min: 1, max: bins, initial: 1, step: 1 }, length);
      expect(domain.time(1)).toBe(0);
      expect(domain.value(0)).toBe(1);
      expect(domain.value(length)).toBe(bins);
      for (let n = 1; n <= bins; n++) {
        const boundary = domain.time(n);
        expect(domain.value(boundary)).toBe(n);
        expect(domain.value(adjacent(boundary, 1))).toBe(n);
        if (n > 1) {
          expect(domain.value(adjacent(boundary, -1))).toBe(n - 1);
          expect(boundary).toBeGreaterThan(domain.time(n - 1));
        }
      }
    }
});
