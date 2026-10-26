export const ARM = Object.freeze({ upper: 220, lower: 175, minRadius: 115, maxRadius: 380, minAngle: 65 * Math.PI / 180, maxAngle: 150 * Math.PI / 180, origin: Object.freeze({ x: 650, y: 430 }) });
export const TARGETS = Object.freeze([
  Object.freeze({ id: 'inspect', name: 'Inspect', note: 'High and close', x: 560, y: 150 }),
  Object.freeze({ id: 'transfer', name: 'Transfer', note: 'Reach across', x: 325, y: 240 }),
  Object.freeze({ id: 'park', name: 'Park', note: 'Fold inward', x: 535, y: 350 }),
]);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
export function boundPoint(point) {
  const dx = point.x - ARM.origin.x, dy = ARM.origin.y - point.y;
  const radius = clamp(Math.hypot(dx, dy), ARM.minRadius, ARM.maxRadius);
  const rawAngle = Math.atan2(dy, dx);
  // Compare directions on the circle; negative atan2 angles can be nearer the left boundary.
  const nearestBoundary = Math.cos(rawAngle - ARM.minAngle) >= Math.cos(rawAngle - ARM.maxAngle) ? ARM.minAngle : ARM.maxAngle;
  const angle = rawAngle >= ARM.minAngle && rawAngle <= ARM.maxAngle ? rawAngle : nearestBoundary;
  return { radius, angle };
}
export function pointAt(polar) {
  return { x: ARM.origin.x + polar.radius * Math.cos(polar.angle), y: ARM.origin.y - polar.radius * Math.sin(polar.angle) };
}
export function solve(polar) {
  const radius = clamp(polar.radius, ARM.minRadius, ARM.maxRadius);
  const angle = clamp(polar.angle, ARM.minAngle, ARM.maxAngle);
  const bend = Math.acos(clamp((radius * radius - ARM.upper ** 2 - ARM.lower ** 2) / (2 * ARM.upper * ARM.lower), -1, 1));
  const shoulder = angle + Math.atan2(ARM.lower * Math.sin(bend), ARM.upper + ARM.lower * Math.cos(bend));
  const forearm = shoulder - bend;
  const elbow = { x: ARM.origin.x + ARM.upper * Math.cos(shoulder), y: ARM.origin.y - ARM.upper * Math.sin(shoulder) };
  const tip = { x: elbow.x + ARM.lower * Math.cos(forearm), y: elbow.y - ARM.lower * Math.sin(forearm) };
  return { shoulder, forearm, elbow, tip, radius, angle };
}
export function createMotion(target) {
  return { radius: target.radius, angle: target.angle, radiusVelocity: 0, angleVelocity: 0 };
}
// Exact critically damped solution: retargeting keeps the currently displayed pose and velocity.
function damp(position, velocity, goal, dt) {
  const frequency = 15, displacement = position - goal;
  const b = velocity + frequency * displacement, decay = Math.exp(-frequency * dt);
  return [goal + (displacement + b * dt) * decay, (velocity - frequency * b * dt) * decay];
}
export function advance(motion, target, dt) {
  const [radius, radiusVelocity] = damp(motion.radius, motion.radiusVelocity, target.radius, dt);
  const [angle, angleVelocity] = damp(motion.angle, motion.angleVelocity, target.angle, dt);
  const boundedRadius = clamp(radius, ARM.minRadius, ARM.maxRadius), boundedAngle = clamp(angle, ARM.minAngle, ARM.maxAngle);
  return { radius: boundedRadius, angle: boundedAngle, radiusVelocity: radius === boundedRadius ? radiusVelocity : 0, angleVelocity: angle === boundedAngle ? angleVelocity : 0 };
}
export function isSettled(motion, target) {
  return Math.abs(motion.radius - target.radius) < .015 && Math.abs(motion.angle - target.angle) < .00005 && Math.abs(motion.radiusVelocity) < .08 && Math.abs(motion.angleVelocity) < .0002;
}
