import { type JSX, createMemo, createSignal, For, onCleanup, onMount } from "solid-js";
import type { Scene } from "../post/scene/clock";
import { animationRail, playheadGrabOffset } from "./timeline-model";
import { PathPlayhead } from "./PathPlayhead";
import "./curve-timeline.css";

/** One continuous time control; normal-flow buttons select exact beat starts. */
export function CurveTimeline(props: {
  scene: Scene;
  label: string;
  actions?: JSX.Element;
  /** The figure rests on its opening picture: no step is marked as under way. */
  idle?: boolean;
}) {
  const scene = props.scene;
  const stops = [
    ...scene.beats.map((beat, i) => ({ label: beat.label, time: scene.start(i) })),
    { label: "End", time: scene.length },
  ];
  const [width, setWidth] = createSignal(320);
  const rail = createMemo(() => animationRail(width()));
  const fraction = () => Math.max(0, Math.min(1, scene.t() / scene.length));
  const distance = () => fraction() * rail().length;
  let root!: HTMLDivElement, svg!: SVGSVGElement;
  let drag:
    | {
        pointer: number;
        offset: number;
        width: number;
        viewportWidth: number;
        viewportHeight: number;
      }
    | undefined;
  const stopDragging = () => {
    const pointer = drag?.pointer;
    drag = undefined;
    if (pointer !== undefined && root.hasPointerCapture(pointer))
      root.releasePointerCapture(pointer);
  };
  const select = (time: number) => {
    scene.pause();
    scene.seek(time);
  };
  const pointerPoint = (event: PointerEvent) => {
    const matrix = svg.getScreenCTM();
    return matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      : undefined;
  };
  const scrub = (event: PointerEvent) => {
    // A move can arrive before ResizeObserver or the viewport resize event.
    if (
      drag &&
      (drag.width !== root.clientWidth ||
        drag.viewportWidth !== innerWidth ||
        drag.viewportHeight !== innerHeight)
    ) {
      stopDragging();
      return;
    }
    const point = pointerPoint(event);
    if (point)
      select((scene.length * (rail().project(point) - (drag?.offset ?? 0))) / rail().length);
  };
  const down = (event: PointerEvent) => {
    if (drag || event.button !== 0 || !event.isPrimary) return;
    const point = pointerPoint(event);
    if (!point) return;
    scene.pause();
    drag = {
      pointer: event.pointerId,
      width: root.clientWidth,
      viewportWidth: innerWidth,
      viewportHeight: innerHeight,
      offset: playheadGrabOffset(rail(), distance(), point),
    };
    root.focus({ preventScroll: true });
    root.setPointerCapture(event.pointerId);
    event.preventDefault();
    scrub(event);
  };
  const finish = (event: PointerEvent) => {
    if (drag?.pointer === event.pointerId) stopDragging();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      stopDragging();
      return;
    }
    const now = scene.t(),
      increment = scene.length / 100;
    const commands: Record<string, () => number> = {
      Home: () => 0,
      End: () => scene.length,
      ArrowRight: () => now + increment,
      ArrowUp: () => now + increment,
      ArrowLeft: () => now - increment,
      ArrowDown: () => now - increment,
      PageUp: () => stops.find((stop) => stop.time > now + 0.001)?.time ?? scene.length,
      PageDown: () => [...stops].reverse().find((stop) => stop.time < now - 0.001)?.time ?? 0,
    };
    const command = commands[event.key];
    if (!command) return;
    event.preventDefault();
    stopDragging();
    select(command());
  };
  onMount(() => {
    const measure = () => {
      // Layout pixels keep the SVG and its CTM consistent under CSS zoom.
      const next = Math.max(96, root.clientWidth);
      if (Math.abs(next - width()) > 0.01) {
        stopDragging();
        setWidth(next);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    measure();
    // Even a viewport resize that leaves the rail width unchanged ends the grab.
    addEventListener("resize", stopDragging);
    onCleanup(() => {
      stopDragging();
      observer.disconnect();
      removeEventListener("resize", stopDragging);
    });
  });
  const here = (i: number) =>
    !props.idle && (scene.ended() ? i === stops.length - 1 : i === Math.max(0, scene.beat()));
  const x = (time: number) => rail().pointAt((time / scene.length) * rail().length).x;
  const center = (i: number) => (x(stops[i].time) + x(stops[i + 1].time)) / 2;
  const current = () => (scene.ended() ? "End" : scene.beats[Math.max(0, scene.beat())]?.label);
  return (
    <div class="nk-timeline" data-nk-timeline aria-label={props.label}>
      <div class="nk-timeline-transport">
        {props.actions}
        <div class="nk-timeline-track">
          <div
            class="nk-timeline-slider"
            ref={root}
            role="slider"
            tabIndex={0}
            aria-label={props.label}
            aria-orientation="horizontal"
            aria-valuemin={0}
            aria-valuemax={scene.length}
            aria-valuenow={scene.t()}
            aria-valuetext={`${current()}, ${Math.round(fraction() * 100)} percent`}
            onPointerDown={down}
            onPointerMove={(event) => {
              if (drag?.pointer === event.pointerId) scrub(event);
            }}
            onPointerUp={finish}
            onPointerCancel={finish}
            onLostPointerCapture={finish}
            onKeyDown={key}
          >
            <svg
              ref={svg}
              width={width()}
              height="64"
              viewBox={`0 0 ${width()} 64`}
              aria-hidden="true"
            >
              <path class="nk-timeline-hit" d={rail().path} />
              <path class="nk-timeline-rail" d={rail().path} />
              <For each={stops}>
                {(stop) => {
                  const point = () => rail().pointAt((stop.time / scene.length) * rail().length);
                  return (
                    <line
                      class="nk-timeline-beat"
                      x1={point().x}
                      x2={point().x}
                      y1={point().y - 4}
                      y2={point().y + 4}
                    />
                  );
                }}
              </For>
              <PathPlayhead class="nk-timeline-thumb" rail={rail()} distance={distance()} />
            </svg>
          </div>
          {/* Each label sits under the middle of the beat it names; End sits at the end. */}
          <div class="nk-timeline-labels">
            <For each={stops}>
              {(stop, i) => (
                <button
                  type="button"
                  class="nk-timeline-label"
                  data-end={i() === stops.length - 1 ? "" : undefined}
                  aria-label={i() === stops.length - 1 ? stop.label : undefined}
                  style={i() === stops.length - 1 ? undefined : { left: `${center(i())}px` }}
                  data-active={here(i()) ? "" : undefined}
                  aria-current={here(i()) ? "step" : undefined}
                  onClick={() => {
                    stopDragging();
                    select(stop.time);
                  }}
                >
                  {i() === stops.length - 1 ? (
                    <span aria-hidden="true">⇥</span>
                  ) : (
                    <span>{stop.label}</span>
                  )}
                </button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  );
}
