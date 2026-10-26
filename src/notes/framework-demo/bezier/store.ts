import { createRoot, createSignal } from "solid-js";
import { clampPoint, PRESETS, START, type Cubic, type Point } from "./model";

/** One set of control points for the whole page: drag them in any figure and every figure follows. */
export const { points, movePoint, resetPoints, moved, selectPreset, selectedPreset } = createRoot(
  () => {
    const [points, setPoints] = createSignal<Cubic>(START);
    const movePoint = (i: number, q: Point) =>
      setPoints((p) => p.map((old, k) => (k === i ? clampPoint(q) : old)) as unknown as Cubic);
    const resetPoints = () => setPoints(START);
    const moved = () => points().some((q, i) => q[0] !== START[i][0] || q[1] !== START[i][1]);
    const selectPreset = (id: (typeof PRESETS)[number]["id"]) =>
      setPoints(PRESETS.find((p) => p.id === id)!.points);
    const selectedPreset = () =>
      PRESETS.find((p) =>
        p.points.every((q, i) => q[0] === points()[i][0] && q[1] === points()[i][1]),
      )?.id;
    return { points, movePoint, resetPoints, moved, selectPreset, selectedPreset };
  },
);
