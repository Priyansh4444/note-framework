import { createEffect, createMemo, createSignal, For, Index, onCleanup, onMount } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import {
  advanceLayers,
  layerTarget,
  validateLayers,
  type FigureLayer,
  type LayerPose,
} from "./layer-model";
import { Choice } from "../ui";
import "./layer.css";
export type { FigureLayer } from "./layer-model";
export type LayerFigureProps = {
  layers: readonly FigureLayer[];
  label: string;
  initial?: string;
  value?: string;
  onChange?: (id: string) => void;
  viewBox?: readonly [number, number, number, number];
};

/** Hairline-inspired construction sheets. Author paths stay in their own ordinary 2D coordinates. */
export function LayerFigure(props: LayerFigureProps) {
  const layers = createMemo(() => validateLayers(props.layers));
  const [local, setLocal] = createSignal(props.initial ?? layers()[0].id);
  const index = createMemo(() => {
    const i = layers().findIndex((l) => l.id === (props.value ?? local()));
    if (i < 0) throw new Error("LayerFigure: selected layer ID does not exist.");
    return i;
  });
  const box = createMemo(() => {
    const b = props.viewBox ?? [0, 0, 400, 240];
    if (b.length !== 4 || !b.every(Number.isFinite) || b[2] <= 0 || b[3] <= 0)
      throw new Error("LayerFigure: viewBox needs finite coordinates and positive dimensions.");
    return b;
  });
  const clone = (layer: FigureLayer): FigureLayer => ({
    ...layer,
    paths: layer.paths.map((path) => ({ ...path })),
  });
  const [state, setState] = createStore({ layers: layers().map(clone) });
  let root!: HTMLElement, svg!: SVGSVGElement;
  const groups = new Map<string, SVGGElement>();
  const poses = new Map<string, LayerPose>();
  state.layers.forEach((layer, i) =>
    poses.set(layer.id, { ...layerTarget(i, index(), state.layers.length), vl: 0, vf: 0 }),
  );
  const [revision, setRevision] = createSignal(0);
  const ordered = createMemo(() => {
    revision();
    return [...state.layers].sort((a, b) => poses.get(a.id)!.lift - poses.get(b.id)!.lift);
  });
  let selected = index(),
    frame = 0,
    last = 0,
    visible = false,
    reduced = false,
    mounted = false,
    disposed = false,
    moving = false;
  const stop = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  const allowed = () => mounted && !disposed && visible && !document.hidden && !reduced;
  const wake = () => {
    if (allowed() && moving && !frame) frame = requestAnimationFrame(tick);
  };
  function paint() {
    state.layers.forEach((layer) => {
      const pose = poses.get(layer.id)!;
      groups
        .get(layer.id)
        ?.setAttribute(
          "transform",
          `matrix(.83 .35 -.65 .42 ${239 + pose.fan} ${113 - pose.lift})`,
        );
    });
    setRevision((value) => value + 1);
  }
  function settle() {
    state.layers.forEach((layer, i) =>
      Object.assign(poses.get(layer.id)!, layerTarget(i, selected, state.layers.length), {
        vl: 0,
        vf: 0,
      }),
    );
    moving = false;
  }
  function tick(now: number) {
    frame = 0;
    if (!allowed()) {
      last = 0;
      return;
    }
    moving = advanceLayers(
      state.layers.map((layer) => poses.get(layer.id)!),
      selected,
      last ? Math.min(0.05, (now - last) / 1000) : 0,
    );
    last = now;
    paint();
    if (moving) wake();
    else last = 0;
  }
  createEffect(() => {
    selected = index();
    const next = layers();
    next.forEach((layer, i) => {
      if (!poses.has(layer.id))
        poses.set(layer.id, { ...layerTarget(i, selected, next.length), vl: 0, vf: 0 });
    });
    setState("layers", reconcile(next.map(clone), { key: "id" }));
    const ids = new Set(next.map((layer) => layer.id));
    for (const id of poses.keys()) if (!ids.has(id)) poses.delete(id);
    if (reduced || !mounted) settle();
    else moving = true;
    if (mounted) {
      paint();
      wake();
    }
  });
  onMount(() => {
    mounted = true;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const preference = () => {
      reduced = media.matches;
      stop();
      if (reduced) {
        settle();
        paint();
      } else wake();
    };
    preference();
    const visibility = () => {
      stop();
      wake();
    };
    const observer = new IntersectionObserver((entries) => {
      visible = entries[entries.length - 1].isIntersecting;
      visibility();
    });
    observer.observe(root);
    media.addEventListener("change", preference);
    document.addEventListener("visibilitychange", visibility);
    paint();
    Object.defineProperty(svg, "layerSnapshot", {
      value: () => ({
        poses: state.layers.map((layer) => ({ ...poses.get(layer.id)! })),
        ids: state.layers.map((layer) => layer.id),
        selected,
        running: !!frame,
        visible,
        reduced,
        disposed,
      }),
    });
    onCleanup(() => {
      disposed = true;
      mounted = false;
      stop();
      observer.disconnect();
      media.removeEventListener("change", preference);
      document.removeEventListener("visibilitychange", visibility);
    });
  });
  const choose = (id: string) => {
    if (props.value === undefined) setLocal(id);
    props.onChange?.(id);
  };
  function point(event: PointerEvent) {
    if (event.pointerType !== "mouse" || !matchMedia("(hover:hover) and (pointer:fine)").matches)
      return;
    const matrix = svg.getScreenCTM();
    if (!matrix) return;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    // Each front-left resting edge is a fixed pick target, independent of its animated lift.
    const gap = Math.min(25, 120 / layers().length),
      y = p.y - 113 - 0.42 * 170;
    const i = Math.round(y / gap);
    if (
      p.x >= 115 &&
      p.x <= 155 &&
      i >= 0 &&
      i < layers().length &&
      Math.abs(y - i * gap) < gap / 2
    )
      choose(layers()[i].id);
  }
  return (
    <figure ref={root} class="nk-layers" aria-label={props.label} data-layer={layers()[index()].id}>
      <svg
        ref={svg}
        viewBox="0 0 600 420"
        role="img"
        aria-label={`${props.label}: ${layers()[index()].label}`}
        onPointerMove={point}
      >
        <For each={ordered()}>
          {(layer) => {
            const id = layer.id;
            onCleanup(() => groups.delete(id));
            return (
              <g
                ref={(g) => {
                  groups.set(id, g);
                }}
                data-layer-id={id}
                class="nk-layer-plane"
                classList={{ "is-selected": layers()[index()].id === id }}
              >
                <rect x="-8" y="-8" width="296" height="186" rx="9" class="nk-layer-edge" />
                <rect x="-4" y="-4" width="288" height="178" rx="6" class="nk-layer-crease" />
                <g
                  transform={`scale(${280 / box()[2]} ${170 / box()[3]}) translate(${-box()[0]} ${-box()[1]})`}
                >
                  <Index each={layer.paths}>
                    {(path) => (
                      <path d={path().d} class={`nk-layer-path ${path().role ?? "ink"}`} />
                    )}
                  </Index>
                </g>
              </g>
            );
          }}
        </For>
      </svg>
      <figcaption>
        <span>{props.label}</span>
        <Choice
          label={`Choose a layer for ${props.label}`}
          options={layers()}
          value={layers()[index()].id}
          onChange={choose}
        />
      </figcaption>
    </figure>
  );
}
