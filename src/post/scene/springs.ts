import { spring } from "motion";

/**
 * The springs used everywhere, named by feel. Values follow anoma.ly's figures:
 * mostly critically damped (bounce 0), short visual durations, a little bounce
 * reserved for things that "land".
 */
export const SPRINGS = {
  /** Default for state changes: fast, no overshoot. */
  settle: { visualDuration: 0.3, bounce: 0 },
  /** Things arriving: controls, tooltips, new rows. */
  land: { visualDuration: 0.25, bounce: 0.25 },
  /** Something filling or growing. */
  fill: { visualDuration: 0.45, bounce: 0.08 },
  /** Larger moves across a figure. */
  glide: { visualDuration: 0.5, bounce: 0 },
} as const;

export type SpringName = keyof typeof SPRINGS;
export type SpringOptions = { visualDuration: number; bounce: number };

/**
 * A spring as a pure function of elapsed ms (0 → 1). Scene figures read it from
 * the scene clock, so seeking and scrubbing land on the same frame as playback.
 */
export function springCurve(options: SpringName | SpringOptions) {
  const generator = spring({
    keyframes: [0, 1],
    ...(typeof options === "string" ? SPRINGS[options] : options),
  });
  return (ms: number) => {
    if (ms <= 0) return 0;
    const state = generator.next(ms);
    return state.done ? 1 : state.value;
  };
}

/** Install each spring as CSS custom properties: --spring-x (easing) and --spring-x-dur (duration). */
export function installSpringVars(root: HTMLElement = document.documentElement) {
  for (const [name, opts] of Object.entries(SPRINGS)) {
    // motion renders a spring as "550ms linear(0, 0.12, …, 1)".
    const css = spring({ keyframes: [0, 1], ...opts }).toString();
    const match = css.match(/^(\d+)ms (linear\(.*\))$/);
    if (!match) continue;
    root.style.setProperty(`--spring-${name}`, match[2]);
    root.style.setProperty(`--spring-${name}-dur`, `${match[1]}ms`);
  }
}
