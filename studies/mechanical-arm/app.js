import { ARM, TARGETS, boundPoint, pointAt, solve, createMotion, advance, isSettled } from './model.js';
const svg = document.querySelector('#mechanism');
const upper = document.querySelector('#upper'), forearm = document.querySelector('#forearm');
const marker = document.querySelector('#tool-marker'), hit = document.querySelector('#tool-hit');
const status = document.querySelector('#status'), reachLabel = document.querySelector('#reach-label'), reachValue = document.querySelector('#reach-value');
const announcement = document.querySelector('#announcement');
const buttons = [...document.querySelectorAll('[data-target]')];
const preference = matchMedia('(prefers-reduced-motion: reduce)');
// One state record owns motion, gesture identity, selection and lifecycle.
const state = { target: boundPoint(TARGETS[0]), motion: createMotion(boundPoint(TARGETS[0])), selection: 'inspect', gesture: null, frame: 0, lastTime: null, visible: true };
const degrees = value => value * 180 / Math.PI;
function render() {
  const pose = solve(state.motion);
  upper.setAttribute('transform', `translate(${ARM.origin.x} ${ARM.origin.y}) rotate(${-degrees(pose.shoulder)})`);
  forearm.setAttribute('transform', `translate(${pose.elbow.x} ${pose.elbow.y}) rotate(${-degrees(pose.forearm)})`);
  marker.setAttribute('transform', `translate(${pose.tip.x} ${pose.tip.y})`);
  hit.setAttribute('cx', pose.tip.x); hit.setAttribute('cy', pose.tip.y);
  reachValue.textContent = String(Math.round(pose.radius));
  reachLabel.textContent = `Reach ${Math.round(pose.radius)} mm`;
  // These attributes expose the actual rendered model for inspectable browser verification.
  svg.dataset.radius = String(pose.radius); svg.dataset.angle = String(pose.angle);
  svg.dataset.tipX = String(pose.tip.x); svg.dataset.tipY = String(pose.tip.y);
  svg.dataset.elbowX = String(pose.elbow.x); svg.dataset.elbowY = String(pose.elbow.y);
}
function setStatus(text) { status.textContent = text; }
function stopClock() {
  if (state.frame) cancelAnimationFrame(state.frame);
  state.frame = 0; state.lastTime = null;
}
function canRun() { return state.visible && !document.hidden && !preference.matches; }
function tick(time) {
  state.frame = 0;
  if (!canRun()) { state.lastTime = null; return; }
  const dt = state.lastTime === null ? 0 : Math.min((time - state.lastTime) / 1000, .05);
  state.lastTime = time;
  state.motion = advance(state.motion, state.target, dt);
  if (isSettled(state.motion, state.target)) {
    state.motion = createMotion(state.target); state.lastTime = null;
    setStatus('Target reached'); render(); return;
  }
  render(); state.frame = requestAnimationFrame(tick);
}
function startClock() {
  if (canRun() && !state.frame && !isSettled(state.motion, state.target)) state.frame = requestAnimationFrame(tick);
}
function select(id) {
  state.selection = id;
  for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.target === id));
}
function command(point, immediate, id = null) {
  state.target = boundPoint(point); select(id);
  if (immediate || preference.matches) {
    stopClock(); state.motion = createMotion(state.target); render();
    setStatus(state.gesture ? 'Following your hand' : 'Target reached');
  } else { setStatus('Moving to target'); startClock(); }
}
function localPoint(event) {
  const matrix = svg.getScreenCTM();
  return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
}
// Preserve the grabbed tool's offset: touching its hit area must never teleport the linkage.
svg.addEventListener('pointerdown', event => {
  if (state.gesture || !event.isPrimary || event.button !== 0) return;
  const point = localPoint(event), tip = solve(state.motion).tip;
  const onTool = Math.hypot(point.x - tip.x, point.y - tip.y) < 48;
  state.gesture = { id: event.pointerId, offsetX: onTool ? tip.x - point.x : 0, offsetY: onTool ? tip.y - point.y : 0 };
  stopClock(); svg.setPointerCapture(event.pointerId); svg.classList.add('dragging'); svg.focus({ preventScroll: true });
  if (!onTool) command(point, true); else { state.target = { radius: state.motion.radius, angle: state.motion.angle }; state.motion = createMotion(state.target); select(null); setStatus('Following your hand'); }
});
svg.addEventListener('pointermove', event => {
  if (event.pointerId !== state.gesture?.id) return;
  const point = localPoint(event);
  command({ x: point.x + state.gesture.offsetX, y: point.y + state.gesture.offsetY }, true);
});
function endGesture(event) {
  if (event.pointerId !== state.gesture?.id) return;
  state.gesture = null; svg.classList.remove('dragging');
  if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
  setStatus('Position held'); announcement.textContent = `Tool held at ${Math.round(state.motion.radius)} millimeters reach.`;
}
svg.addEventListener('pointerup', endGesture); svg.addEventListener('pointercancel', endGesture); svg.addEventListener('lostpointercapture', endGesture);
svg.addEventListener('keydown', event => {
  if (event.key === 'Home') { event.preventDefault(); command(TARGETS[2], true, 'park'); return; }
  const offsets = { ArrowLeft: [-1,0], ArrowRight: [1,0], ArrowUp: [0,-1], ArrowDown: [0,1] };
  const offset = offsets[event.key]; if (!offset) return;
  event.preventDefault(); const point = pointAt(state.motion), step = event.shiftKey ? 25 : 8;
  command({ x: point.x + offset[0]*step, y: point.y + offset[1]*step }, true);
});
for (const button of buttons) button.addEventListener('click', event => {
  const target = TARGETS.find(target => target.id === button.dataset.target);
  command(target, event.detail === 0, target.id);
  announcement.textContent = `${target.name} target selected.`;
});
preference.addEventListener('change', () => {
  if (preference.matches) { stopClock(); state.motion = createMotion(state.target); render(); setStatus('Target reached'); }
  else startClock();
});
document.addEventListener('visibilitychange', () => { if (document.hidden) stopClock(); else startClock(); });
new IntersectionObserver(entries => {
  state.visible = entries[entries.length-1].isIntersecting;
  if (state.visible) startClock(); else stopClock();
}, { threshold: .05 }).observe(svg);
function resizeDrawing() { svg.setAttribute('viewBox', innerWidth <= 700 ? '260 20 630 550' : '0 0 1000 600'); }
addEventListener('resize', resizeDrawing); resizeDrawing();
const arc = (radius, angle) => pointAt({ radius, angle });
const outerStart = arc(ARM.maxRadius, ARM.minAngle), outerEnd = arc(ARM.maxRadius, ARM.maxAngle);
const innerEnd = arc(ARM.minRadius, ARM.maxAngle), innerStart = arc(ARM.minRadius, ARM.minAngle);
document.querySelector('#workspace').setAttribute('d', `M${outerStart.x} ${outerStart.y} A${ARM.maxRadius} ${ARM.maxRadius} 0 0 0 ${outerEnd.x} ${outerEnd.y} L${innerEnd.x} ${innerEnd.y} A${ARM.minRadius} ${ARM.minRadius} 0 0 1 ${innerStart.x} ${innerStart.y} Z`);
render();
