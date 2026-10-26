import type { Scene } from "../post/scene/clock";

export type PlaybackSpec = {
  min: number;
  max: number;
  initial: number;
  /** Use only for discrete domains, such as an integer piece count. */
  step?: number;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Affine continuous values, or equal-duration bins for a discrete domain. */
export function playbackDomain(spec: PlaybackSpec, length: number) {
  const { min, max, initial, step } = spec;
  const intervals = step === undefined ? 0 : (max - min) / step;
  if (
    ![min, max, initial, length, max - min].every(Number.isFinite) ||
    max <= min ||
    length <= 0 ||
    (step !== undefined &&
      (!Number.isFinite(step) ||
        step <= 0 ||
        !Number.isSafeInteger(Math.round(intervals)) ||
        Math.abs(intervals - Math.round(intervals)) > 1e-8))
  ) {
    throw new Error(
      "Playback needs finite increasing bounds, positive duration and evenly spaced discrete bins.",
    );
  }
  const bins = Math.round(intervals) + 1;
  const boundary = (index: number) => (index / bins) * length;
  return {
    value(time: number) {
      const bounded = clamp(time, 0, length);
      if (step === undefined) return min + (max - min) * (bounded / length);
      // Compare against the very same representable boundaries used by time().
      // floor(time / length * bins) can round a seek into the preceding bin.
      let lo = 0,
        hi = bins - 1;
      while (lo < hi) {
        const middle = lo + Math.ceil((hi - lo) / 2);
        if (bounded >= boundary(middle)) lo = middle;
        else hi = middle - 1;
      }
      return min + lo * step;
    },
    time(value: number) {
      if (!Number.isFinite(value)) throw new Error("Playback selection must be finite.");
      const v = clamp(value, min, max);
      return step === undefined
        ? ((v - min) / (max - min)) * length
        : boundary(Math.round((v - min) / step));
    },
  };
}

/** The scene is the only owner of position. Grabs and selections never resume it. */
export function createPlayback(scene: Scene, spec: PlaybackSpec) {
  const domain = playbackDomain(spec, scene.length);
  const seek = (value: number) => {
    scene.pause();
    scene.seek(domain.time(value));
  };
  seek(spec.initial);
  return { value: () => domain.value(scene.t()), seek, pause: scene.pause };
}
