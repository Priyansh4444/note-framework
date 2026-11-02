import { animate, type DOMKeyframesDefinition } from "motion";
import { SPRINGS, type SpringName } from "../post/scene/springs";

/**
 * Interface motion. Kit components call this so pages never write transitions.
 * Figures keep reading the scene clock; this is only for chrome (indicators, panels).
 * A new call on the same element starts from the current value, so rapid input never jumps.
 */
export const still = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function glide(el: Element, to: DOMKeyframesDefinition, feel: SpringName = "settle") {
  return animate(el, to, still() ? { duration: 0 } : { type: "spring", ...SPRINGS[feel] });
}

/**
 * Drive data from 0 to 1 on the no-overshoot spring, e.g. control points moving to a preset.
 * Lands on exactly 1. Every intermediate state must be valid. Returns a stop function; reduced motion lands at once.
 */
export function blend(update: (p: number) => void, feel: SpringName = "glide") {
  if (still()) {
    update(1);
    return () => {};
  }
  const run = animate(0, 1, {
    type: "spring",
    ...SPRINGS[feel],
    onUpdate: update,
    onComplete: () => update(1),
  });
  return () => run.stop();
}

/** Set motion-owned values immediately (keeps later glides continuous). */
export const jump = (el: Element, to: DOMKeyframesDefinition) => animate(el, to, { duration: 0 });

const sizing = new WeakMap<HTMLElement, ReturnType<typeof glide>>();

/** Animate an element's height across a content change made by `change`. Interruptible. */
export function resize(el: HTMLElement, change: () => void) {
  const from = el.getBoundingClientRect().height;
  sizing.get(el)?.stop();
  change();
  queueMicrotask(() => {
    el.style.height = "";
    el.style.overflow = "";
    const to = el.getBoundingClientRect().height;
    if (Math.abs(to - from) < 1 || still()) return;
    el.style.overflow = "clip";
    const run = glide(el, { height: [`${from}px`, `${to}px`] });
    sizing.set(el, run);
    run.finished.then(() => {
      if (sizing.get(el) !== run) return;
      sizing.delete(el);
      el.style.height = "";
      el.style.overflow = "";
    });
  });
}
