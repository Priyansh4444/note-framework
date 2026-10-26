import type { Scene } from "../post/scene/clock";
import { springCurve } from "../post/scene/springs";

const curves = {
  settle: springCurve("settle"),
  land: springCurve("land"),
  fill: springCurve("fill"),
  glide: springCurve("glide"),
};
export type Curve = keyof typeof curves;

/**
 * 0 → 1 for a move that begins `delay` ms into beat `i`, eased by a spring.
 * A pure function of the scene clock, so scrubbing lands on the playback frame.
 * Use "settle"/"glide" (bounce 0) for anything that carries a value; "land" may overshoot.
 */
export function enter(s: Scene, i: number, delay = 0, curve: Curve = "settle") {
  if (!s.started()) return 0;
  return curves[curve](s.t() - s.start(i) - delay);
}

/** The same spring, measured from an absolute scene time. */
export function since(s: Scene, at: number, curve: Curve = "settle") {
  if (!s.started()) return 0;
  return curves[curve](s.t() - at);
}

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;
export const clamp01 = (p: number) => Math.max(0, Math.min(1, p));
