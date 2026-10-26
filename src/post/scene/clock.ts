import { type Accessor, batch, createMemo, createSignal, onCleanup } from "solid-js";

export interface Beat {
  /** Shown on the timeline and read by screen readers. */
  label: string;
  /** How long this beat lasts, in ms. */
  ms: number;
}

export interface Scene {
  beats: readonly Beat[];
  /** Elapsed scene time in ms. Everything visual is a pure function of this. */
  t: Accessor<number>;
  length: number;
  started: Accessor<boolean>;
  playing: Accessor<boolean>;
  /** Actual forward playback, including document and figure visibility gates. */
  readonly active: Accessor<boolean>;
  /** Every transport jump changes this atomically with time, even a tiny seek. */
  readonly revision: Accessor<number>;
  ended: Accessor<boolean>;
  /** Index of the current beat (−1 before the first). */
  beat: Accessor<number>;
  /** 0→1 progress through beat i (0 before it starts, 1 after it ends). */
  progress: (i: number) => number;
  /** Has beat i started? */
  reached: (i: number) => boolean;
  /** Start time of beat i, in ms. */
  start: (i: number) => number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  replay: () => void;
  seek: (ms: number) => void;
  seekBeat: (i: number) => void;
  /** Attach to the scene's root so it pauses offscreen. */
  attach: (el: HTMLElement) => void;
}

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * A scene is a timeline of beats driven by one clock. Components derive their
 * state from `t` (and the beat helpers), so pausing, scrubbing and replaying are
 * free, and a scene can never get "out of sync" with its controls.
 */
export function createScene(beats: readonly Beat[]): Scene {
  const starts = beats.reduce<number[]>(
    (acc, b, i) => [...acc, i === 0 ? 0 : acc[i - 1] + beats[i - 1].ms],
    [],
  );
  const length = starts[starts.length - 1] + beats[beats.length - 1].ms;

  const [t, setT] = createSignal(0);
  const [started, setStarted] = createSignal(false);
  const [playing, setPlaying] = createSignal(false);
  const [visible, setVisible] = createSignal(true);
  const [foreground, setForeground] = createSignal(
    typeof document === "undefined" || !document.hidden,
  );
  const [revision, setRevision] = createSignal(0);
  const active = createMemo(() => playing() && visible() && foreground());
  const ended = createMemo(() => t() >= length);

  let raf = 0;
  let last = 0;
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(64, now - last));
    last = now;
    if (active()) {
      const next = Math.min(length, t() + dt);
      setT(next);
      if (next >= length) setPlaying(false);
    }
    raf = playing() ? requestAnimationFrame(frame) : 0;
  };
  const run = () => {
    if (raf) return;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  };

  const jump = (ms: number) =>
    batch(() => {
      setRevision((n) => n + 1);
      setStarted(true);
      setT(Math.max(0, Math.min(length, ms)));
    });

  const play = () => {
    batch(() => {
      setStarted(true);
      if (reducedMotion()) {
        jump(length);
        setPlaying(false);
        return;
      }
      if (ended()) jump(0);
      setPlaying(true);
    });
    if (!playing()) return;
    run();
  };
  const pause = () => setPlaying(false);
  const media =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : undefined;
  const preferenceChanged = () => {
    if (media?.matches) pause();
  };
  media?.addEventListener?.("change", preferenceChanged);
  const visibilityChanged = () => {
    last = performance.now();
    setForeground(!document.hidden);
  };
  if (typeof document !== "undefined")
    document.addEventListener?.("visibilitychange", visibilityChanged);

  const beat = createMemo(() => {
    if (!started()) return -1;
    let i = -1;
    for (let k = 0; k < beats.length; k++) if (t() >= starts[k]) i = k;
    return i;
  });

  let observer: IntersectionObserver | undefined;
  onCleanup(() => {
    if (raf) cancelAnimationFrame(raf);
    observer?.disconnect();
    media?.removeEventListener?.("change", preferenceChanged);
    if (typeof document !== "undefined")
      document.removeEventListener?.("visibilitychange", visibilityChanged);
  });

  return {
    beats,
    t,
    length,
    started,
    playing,
    active,
    revision,
    ended,
    beat,
    progress: (i) => (started() ? Math.max(0, Math.min(1, (t() - starts[i]) / beats[i].ms)) : 0),
    reached: (i) => started() && t() >= starts[i],
    start: (i) => starts[i],
    play,
    pause,
    toggle: () => (playing() ? pause() : play()),
    replay: () =>
      batch(() => {
        jump(0);
        play();
      }),
    seek: jump,
    seekBeat: (i) => {
      batch(() => {
        pause();
        // Land at the end of the beat, so its state is fully visible, but stay inside
        // it: the next beat starts exactly at starts[i] + ms. The last beat may end the scene.
        jump(i === beats.length - 1 ? length : starts[i] + beats[i].ms - 1);
      });
    },
    attach: (el) => {
      observer?.disconnect();
      observer = new IntersectionObserver(
        ([e]) => {
          last = performance.now();
          setVisible(e.isIntersecting);
        },
        { threshold: 0.15 },
      );
      observer.observe(el);
    },
  };
}

/** Smoothstep-ish easing for values derived from progress. */
export const ease = (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : 1 - Math.pow(1 - p, 3));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
/** Progress of the k-th of n staggered items within a beat's 0→1 progress. */
export const stagger = (p: number, k: number, n: number, overlap = 0.6) => {
  const span = 1 / (n - (n - 1) * overlap);
  const start = k * span * (1 - overlap);
  return Math.max(0, Math.min(1, (p - start) / span));
};
