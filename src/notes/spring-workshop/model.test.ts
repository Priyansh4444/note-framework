import { expect, test } from "bun:test";
import { response, safeRelease, energy, omega, rest } from "./model";
for (const ratio of [0.22, 1, 1.8]) {
  test(`exact response preserves initial state, composes and dissipates energy (${ratio})`, () => {
    const initial = { x: 21, v: -28 };
    expect(response(initial, 0, ratio).x).toBeCloseTo(initial.x, 9);
    expect(response(initial, 0, ratio).v).toBeCloseTo(initial.v, 9);
    let last = energy(initial);
    for (let t = 0; t <= 6; t += 0.01) {
      const p = response(initial, t, ratio),
        composed = response(response(initial, t / 2, ratio), t / 2, ratio);
      expect(p.x).toBeCloseTo(composed.x, 8);
      expect(p.v).toBeCloseTo(composed.v, 8);
      expect(energy(p)).toBeLessThanOrEqual(last + 1e-7);
      last = energy(p);
      const dt = 0.00001;
      const next = response(initial, t + dt, ratio),
        prev = response(initial, Math.max(0, t - dt), ratio);
      if (t > 0)
        expect((next.v - prev.v) / (2 * dt)).toBeCloseTo(
          -2 * ratio * omega * p.v - omega ** 2 * p.x,
          3,
        );
    }
    expect(Math.abs(response(initial, 6, ratio).x)).toBeLessThan(0.001);
    expect(response(rest, 3, ratio)).toEqual(rest);
  });
}
test("all releases fit the physical stroke, including an interrupted return", () => {
  for (let x = -30; x <= 30; x += 3)
    for (const v of [-1000, -200, 0, 200, 1000]) {
      const initial = safeRelease({ x, v });
      expect(energy(initial)).toBeLessThanOrEqual(0.5 * omega ** 2 * 30 ** 2 + 1e-7);
      for (let t = 0; t < 3; t += 0.02)
        expect(Math.abs(response(initial, t, 0.22).x)).toBeLessThanOrEqual(30 + 1e-7);
    }
});
test("damping changes keep position and velocity continuous", () => {
  const old = response({ x: 28, v: 0 }, 0.15, 0.22);
  const changed = response(old, 0, 1.8);
  expect(changed.x).toBeCloseTo(old.x, 10);
  expect(changed.v).toBeCloseTo(old.v, 10);
});
