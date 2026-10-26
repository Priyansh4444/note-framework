import { test, expect } from 'bun:test';
import { ARM, TARGETS, boundPoint, pointAt, solve, createMotion, advance, isSettled } from './model.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
function check(polar) {
  const pose=solve(polar), target=pointAt(polar);
  expect(distance(ARM.origin,pose.elbow)).toBeCloseTo(ARM.upper,9);
  expect(distance(pose.elbow,pose.tip)).toBeCloseTo(ARM.lower,9);
  expect(distance(pose.tip,target)).toBeLessThan(1e-9);
  expect(pose.elbow.x).toBeGreaterThan(250);
  expect(pose.elbow.y).toBeLessThan(540);
  expect(pose.tip.x).toBeGreaterThan(300);
  expect(pose.tip.y).toBeGreaterThan(49);
}
test('the exact model keeps both links fixed over a dense workspace sample',()=>{
  for(let radius=ARM.minRadius;radius<=ARM.maxRadius;radius+=2.5)
    for(let angle=ARM.minAngle;angle<=ARM.maxAngle;angle+=.015) check({radius,angle});
});
test('every named target is reachable without clamping',()=>{
  for(const target of TARGETS)expect(distance(pointAt(boundPoint(target)),target)).toBeLessThan(1e-9);
});
test('outside pointer positions clamp to the same bounded reachable model',()=>{
  for(let x=-1000;x<2000;x+=75) for(let y=-1000;y<2000;y+=75){
    const p=boundPoint({x,y});
    expect(p.radius).toBeGreaterThanOrEqual(ARM.minRadius);expect(p.radius).toBeLessThanOrEqual(ARM.maxRadius);
    expect(p.angle).toBeGreaterThanOrEqual(ARM.minAngle);expect(p.angle).toBeLessThanOrEqual(ARM.maxAngle);check(p);
  }
});
test('below-workspace targets choose the nearest angular boundary across the atan2 seam',()=>{
  expect(boundPoint({x:ARM.origin.x-200,y:ARM.origin.y+200}).angle).toBe(ARM.maxAngle);
  expect(boundPoint({x:ARM.origin.x+200,y:ARM.origin.y+200}).angle).toBe(ARM.minAngle);
});
test('exact damping composes and rapid reversals retain pose and velocity',()=>{
  const a=boundPoint(TARGETS[0]),b=boundPoint(TARGETS[1]);
  const moving=advance(createMotion(a),b,.09);
  const split=advance(advance(moving,a,.018),a,.023),whole=advance(moving,a,.041);
  expect(split.radius).toBeCloseTo(whole.radius,10);expect(split.angle).toBeCloseTo(whole.angle,10);
  const start=advance(moving,a,0);expect(start).toEqual(moving);
  let motion=createMotion(a), target=b;
  for(let i=0;i<600;i++){
    if(i%7===0)target=boundPoint(TARGETS[(i/7|0)%3]);
    motion=advance(motion,target,1/60);check(motion);
  }
  for(let i=0;i<180;i++)motion=advance(motion,target,1/60);
  expect(isSettled(motion,target)).toBe(true);
});
