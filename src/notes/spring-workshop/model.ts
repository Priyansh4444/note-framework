export type Pose = Readonly<{ x: number; v: number }>;
export type Feel = "bounce" | "settle" | "slow";
export const tuning = Object.freeze({
  bounce: {
    label: "A little bounce",
    ratio: 0.22,
    why: "The spring pulls it back. A light damper lets it pass the center and come back again.",
  },
  settle: {
    label: "Just enough",
    ratio: 1,
    why: "Enough damping removes the bounce. Released from rest, it returns quickly without crossing the center.",
  },
  slow: {
    label: "Too much",
    ratio: 1.8,
    why: "More damping is not always faster. The carriage now takes longer to return.",
  },
});
export const omega = 12;
export const stroke = 30;
export const rest: Pose = Object.freeze({ x: 0, v: 0 });
export const clampStroke = (x: number) => Math.max(-stroke, Math.min(stroke, x));
/** Exact solution of x'' + 2 ζω x' + ω²x = 0. x is mm; t is seconds. */
export function response(initial: Pose, seconds: number, ratio: number): Pose {
  if (initial.x === 0 && initial.v === 0) return rest;
  const t = Math.max(0, seconds),
    w = omega,
    a = ratio * w;
  if (ratio < 1) {
    const b = w * Math.sqrt(1 - ratio * ratio),
      B = (initial.v + a * initial.x) / b;
    const c = Math.cos(b * t),
      s = Math.sin(b * t),
      decay = Math.exp(-a * t);
    const wave = initial.x * c + B * s;
    return { x: decay * wave, v: decay * (-a * wave - initial.x * b * s + B * b * c) };
  }
  if (ratio === 1) {
    const B = initial.v + w * initial.x,
      decay = Math.exp(-w * t);
    return { x: (initial.x + B * t) * decay, v: (B - w * (initial.x + B * t)) * decay };
  }
  const b = w * Math.sqrt(ratio * ratio - 1),
    r1 = -a + b,
    r2 = -a - b;
  const A = (initial.v - r2 * initial.x) / (r1 - r2),
    B = initial.x - A;
  return {
    x: A * Math.exp(r1 * t) + B * Math.exp(r2 * t),
    v: A * r1 * Math.exp(r1 * t) + B * r2 * Math.exp(r2 * t),
  };
}
export const energy = (p: Pose) => 0.5 * (p.v * p.v + omega * omega * p.x * p.x);
/** Bound initial speed so even an undamped return cannot hit a mechanical stop. */
export function safeRelease(p: Pose): Pose {
  const x = clampStroke(p.x);
  const limit = omega * Math.sqrt(Math.max(0, stroke * stroke - x * x));
  return { x, v: Math.max(-limit, Math.min(limit, p.v)) };
}
