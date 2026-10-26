import { createEffect, createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import {
  advanceInkPose,
  createInkPose,
  settleInkPose,
  validateInkScenes,
  validateInkViewBox,
  type InkPose,
  type InkScene,
} from "./ink-model";
import "./ink.css";
export { brushStroke } from "./ink-model";
export type { InkMark, InkScene, BrushOptions } from "./ink-model";

export type InkFigureProps = {
  scenes: readonly InkScene[];
  label: string;
  initial?: string;
  value?: string;
  onChange?: (id: string) => void;
  viewBox?: readonly [number, number, number, number];
};

/** A complete still by default. Named scenes retarget the same retained brush marks. */
export function InkFigure(props: InkFigureProps) {
  const scenes = createMemo(() => validateInkScenes(props.scenes));
  const [local, setLocal] = createSignal(props.initial ?? scenes()[0].id);
  const selected = createMemo(() => {
    const id = props.value ?? local();
    const scene = scenes().find((scene) => scene.id === id);
    if (!scene) throw new Error(`InkFigure selected scene "${id}" does not exist.`);
    return scene;
  });
  const box = createMemo(() => validateInkViewBox(props.viewBox ?? [0, 0, 640, 400]));
  const indices = createMemo<number[]>((previous) =>
    previous?.length === scenes()[0].marks.length
      ? previous
      : Array.from({ length: scenes()[0].marks.length }, (_, i) => i),
  );
  const [revision, setRevision] = createSignal(0);
  let pose: InkPose = createInkPose(selected().marks),
    target = selected().marks;
  let root!: HTMLElement,
    mounted = false,
    disposed = false,
    visible = false,
    reduced = false;
  let frame = 0,
    previous = 0,
    moving = false;
  const repaint = () => setRevision((v) => v + 1);
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    previous = 0;
  };
  const allowed = () => mounted && !disposed && visible && !document.hidden && !reduced;
  const wake = () => {
    if (!frame && moving && allowed()) frame = requestAnimationFrame(tick);
  };
  function tick(now: number) {
    frame = 0;
    if (!allowed()) {
      previous = 0;
      return;
    }
    const dt = previous ? Math.min((now - previous) / 1000, 0.05) : 0;
    previous = now;
    moving = advanceInkPose(pose, target, dt);
    repaint();
    if (moving) wake();
    else previous = 0;
  }
  const suspend = () => {
    stop();
    wake();
  };
  createEffect(() => {
    target = selected().marks;
    if (pose.marks.length !== target.length)
      throw new Error("InkFigure: changing mounted mark count requires a new figure.");
    if (reduced || !mounted) {
      settleInkPose(pose, target);
      moving = false;
    } else moving = true;
    repaint();
    wake();
  });
  onMount(() => {
    mounted = true;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      reduced = media.matches;
      if (reduced) {
        stop();
        settleInkPose(pose, target);
        moving = false;
        repaint();
      }
      wake();
    };
    preference();
    Object.defineProperty(root.querySelector("svg")!, "inkSnapshot", {
      value: () => ({
        marks: pose.marks.map((m) => ({ ...m })),
        velocities: pose.velocities.map((v) => ({ ...v })),
        moving,
        running: !!frame,
        visible,
        reduced,
        disposed,
      }),
    });
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", suspend);
    const intersection = new IntersectionObserver(
      (entries) => {
        const newest = entries[entries.length - 1];
        if (newest) visible = newest.isIntersecting;
        suspend();
      },
      { threshold: 0 },
    );
    intersection.observe(root);
    onCleanup(() => {
      disposed = true;
      mounted = false;
      stop();
      intersection.disconnect();
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", suspend);
    });
  });
  const mark = (index: number) => {
    revision();
    return pose.marks[index];
  };
  const choose = (id: string) => {
    if (props.value === undefined) setLocal(id);
    props.onChange?.(id);
  };
  return (
    <figure ref={root} class="nk-ink" aria-label={props.label} data-scene={selected().id}>
      <svg
        role="img"
        aria-label={`${props.label}: ${selected().label}`}
        viewBox={box().join(" ")}
        preserveAspectRatio="xMidYMid meet"
      >
        <For each={indices()}>
          {(i) => (
            <line
              class="nk-ink-mark"
              x1={mark(i).x}
              y1={mark(i).y}
              x2={mark(i).x2}
              y2={mark(i).y2}
              stroke-width={Math.max(0.01, mark(i).width)}
              opacity={Math.max(0, Math.min(1, mark(i).opacity))}
            />
          )}
        </For>
      </svg>
      <figcaption>
        <span class="nk-ink-label">{props.label}</span>
        <div class="nk-ink-scenes" role="group" aria-label={`Choose a scene for ${props.label}`}>
          <For each={scenes()}>
            {(scene) => (
              <button
                type="button"
                aria-pressed={selected().id === scene.id}
                onClick={() => choose(scene.id)}
              >
                {scene.label}
              </button>
            )}
          </For>
        </div>
      </figcaption>
    </figure>
  );
}
