import { createEffect, createMemo, createSignal, onCleanup, onMount, on, untrack } from "solid-js";
import {
  createMorphModel,
  type MorphShape,
  type MorphVertex,
  validateMorphShapes,
} from "./morph-model";
import { Choice } from "../ui";
import "./morph.css";
export { makeMorphShapes, resampleContour } from "./morph-model";
export type { MorphPoint, MorphShape } from "./morph-model";

export interface MorphFigureProps {
  shapes: readonly MorphShape[];
  label: string;
  initial?: string;
  value?: string;
  onChange?: (id: string) => void;
  viewBox?: readonly [number, number, number, number];
  edgeLight?: boolean;
}

/** A retained, interruptible contour spring. Contour/vertex order is the author's correspondence. */
export function MorphFigure(props: MorphFigureProps) {
  validateMorphShapes(props.shapes);
  const [local, setLocal] = createSignal(props.initial ?? props.shapes[0].id);
  const selected = createMemo(() => props.value ?? local());
  const current = createMemo(() => {
    const shape = props.shapes.find((shape) => shape.id === selected());
    if (!shape) throw new Error(`MorphFigure: unknown selected shape “${selected()}”.`);
    return shape;
  });
  const bounds = createMemo(() => {
    const box = props.viewBox ?? [0, 0, 1000, 700];
    if (box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0)
      throw new Error("MorphFigure: viewBox needs finite x/y and positive finite width/height.");
    return box;
  });
  const model = createMorphModel(props.shapes, selected());
  let canvas!: HTMLCanvasElement, stage!: HTMLDivElement;
  let refresh = () => {};
  const [available, setAvailable] = createSignal(true);
  createEffect(
    on([() => props.shapes, selected, bounds, () => props.edgeLight] as const, ([shapes, id]) => {
      model.setShapes(shapes);
      model.setTarget(id);
      refresh();
    }),
  );
  onMount(() => {
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setAvailable(false);
      return;
    }
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      last: number | undefined,
      visible = false,
      disposed = false,
      ticks = 0,
      paints = 0;
    let width = 1,
      height = 1,
      scale = 1,
      ox = 0,
      oy = 0;
    function trace(points: MorphVertex[], offset = 0) {
      ctx!.beginPath();
      points.forEach((point, j) => {
        const speed = Math.hypot(point.vx, point.vy),
          fringe = speed ? offset / speed : 0;
        const x = ox + (point.x + point.vx * fringe) * scale,
          y = oy + (point.y + point.vy * fringe) * scale;
        if (j === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      });
      ctx!.closePath();
    }
    function draw() {
      if (disposed) return;
      // Canvas colours come from the theme tokens declared in morph.css, read once per frame.
      const style = getComputedStyle(canvas);
      const tone = (name: string) => style.getPropertyValue(name).trim();
      const [fill, ink, cool, warm] = [
        "--morph-fill",
        "--morph-ink",
        "--morph-cool",
        "--morph-warm",
      ].map(tone);
      const [x, y, w, h] = untrack(bounds);
      scale = Math.min(width / w, height / h);
      ox = (width - w * scale) / 2 - x * scale;
      oy = (height - h * scale) / 2 - y * scale;
      ctx!.clearRect(0, 0, width, height);
      for (const contour of model.contours) {
        const speed =
          contour.reduce((sum, point) => sum + Math.hypot(point.vx, point.vy), 0) / contour.length;
        if (untrack(() => props.edgeLight ?? true) && !motion.matches && speed > 9) {
          const fringe = Math.min(4, speed / 145);
          trace(contour, fringe);
          ctx!.fillStyle = cool;
          ctx!.fill();
          trace(contour, -fringe);
          ctx!.fillStyle = warm;
          ctx!.fill();
        }
        trace(contour);
        ctx!.globalAlpha = Math.max(0, Math.min(1, model.fill));
        ctx!.fillStyle = fill;
        ctx!.fill();
        ctx!.globalAlpha = 1;
        ctx!.lineWidth = 1.1;
        ctx!.strokeStyle = ink;
        ctx!.stroke();
      }
      paints++;
    }
    function sleep() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      last = undefined;
    }
    const canRun = () => !disposed && visible && !document.hidden && !motion.matches;
    function wake() {
      if (model.moving && canRun() && !frame) frame = requestAnimationFrame(tick);
    }
    function tick(now: number) {
      frame = 0;
      if (!canRun()) {
        last = undefined;
        return;
      }
      model.step(last === undefined ? 1 / 60 : (now - last) / 1000);
      last = now;
      ticks++;
      draw();
      if (model.moving) wake();
      else last = undefined;
    }
    refresh = () => {
      if (motion.matches) {
        sleep();
        model.snap();
      }
      draw();
      wake();
    };
    function resize() {
      const box = stage.getBoundingClientRect(),
        dpr = Math.min(devicePixelRatio || 1, 2);
      width = box.width;
      height = box.height;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }
    const onVisibility = () => {
      if (document.hidden) sleep();
      else wake();
    };
    const onMotion = () => {
      sleep();
      if (motion.matches) {
        model.snap();
        draw();
      } else wake();
    };
    const intersection = new IntersectionObserver((entries) => {
      // Deliveries may contain several records for the same target. The newest owns visibility.
      const latest = entries
        .filter((entry) => entry.target === stage)
        .reduce<IntersectionObserverEntry | undefined>(
          (a, b) => (!a || b.time >= a.time ? b : a),
          undefined,
        );
      if (!latest) return;
      visible = latest.isIntersecting;
      if (visible) wake();
      else sleep();
    });
    const observer = new ResizeObserver(resize);
    intersection.observe(stage);
    observer.observe(stage);
    document.addEventListener("visibilitychange", onVisibility);
    motion.addEventListener("change", onMotion);
    // Read-only per-canvas diagnostics test retained paint, without a global runtime or mutation API.
    Object.defineProperty(canvas, "morphSnapshot", {
      configurable: true,
      value: () => ({
        ...model.snapshot(),
        running: !!frame,
        visible,
        reduced: motion.matches,
        ticks,
        paints,
        disposed,
      }),
    });
    resize();
    refresh();
    onCleanup(() => {
      disposed = true;
      sleep();
      refresh = () => {};
      intersection.disconnect();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
    });
  });
  function select(id: string) {
    if (id === selected()) return;
    if (props.value === undefined) setLocal(id);
    props.onChange?.(id);
  }
  return (
    <figure class="nk-morph" aria-label={props.label}>
      <div class="nk-morph-stage" ref={stage}>
        <canvas ref={canvas} role="img" aria-label={`${props.label}: ${current().label}`} />
        <p class="nk-morph-fallback" hidden={available()}>
          Canvas unavailable. Selected form: {current().label}.
        </p>
      </div>
      <figcaption class="nk-morph-caption">
        <span class="nk-morph-label">{props.label}</span>
        <Choice
          label={`Choose a form for ${props.label}`}
          options={props.shapes}
          value={selected()}
          onChange={select}
        />
        <span class="nk-morph-status" role="status">
          {current().label} selected.
        </span>
      </figcaption>
    </figure>
  );
}
