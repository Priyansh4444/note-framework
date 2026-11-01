import { createRoot, createSignal } from "solid-js";
import { blend } from "../../../kit";
import { mix } from "../examples/de-casteljau";
import { clampPoint, mapCubic, PRESETS, START, type Cubic, type Point } from "./model";

type PresetId = (typeof PRESETS)[number]["id"];

/**
 * One set of control points for the whole page: drag them in any figure and every figure follows.
 * Presets and Reset glide there; a drag or another choice interrupts from the current shape.
 */
export const { points, movePoint, resetPoints, moved, selectPreset, selectedPreset } = createRoot(
  () => {
    const [points, setPoints] = createSignal<Cubic>(START);
    const [aim, setAim] = createSignal<PresetId>();
    let stop = () => {};
    const go = (to: Cubic, id?: PresetId) => {
      stop();
      const from = points();
      setAim(() => id);
      stop = blend((u) => {
        // The page's own mix: exact at u = 1 (see the code chapter).
        setPoints(mapCubic(from, (q, i) => mix(q, to[i], u)));
        if (u === 1) setAim(undefined);
      });
    };
    const movePoint = (i: number, q: Point) => {
      stop();
      setAim(undefined);
      setPoints((p) => mapCubic(p, (old, k) => (k === i ? clampPoint(q) : old)));
    };
    const resetPoints = () => go(START, PRESETS.find((p) => p.points === START)?.id);
    const moved = () => points().some((q, i) => q[0] !== START[i][0] || q[1] !== START[i][1]);
    const selectPreset = (id: PresetId) => go(PRESETS.find((p) => p.id === id)!.points, id);
    const selectedPreset = () =>
      aim() ??
      PRESETS.find((p) =>
        p.points.every((q, i) => q[0] === points()[i][0] && q[1] === points()[i][1]),
      )?.id;
    return { points, movePoint, resetPoints, moved, selectPreset, selectedPreset };
  },
);
